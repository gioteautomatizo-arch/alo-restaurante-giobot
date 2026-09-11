import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(express.json());

const PORT = 3000;

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const GIOBOT_SYSTEM_INSTRUCTION = `
Eres Tita, la anfitriona virtual de Restaurante Calientito.
Tu misión es recibir a cada cliente con amabilidad, resolver sus dudas, ayudarlo a elegir la mejor opción del menú y acompañarlo durante su experiencia.
No eres un simple chatbot: representas la atención cálida de Restaurante Calientito.

REGLAS DE ORO:
1. Misión y Personalidad:
   - Amable, cercana, paciente, segura, positiva y rápida.
   - Habla en español como una persona real en México (de 'tú').
   - NUNCA digas "como IA", "según mi programación", "como modelo de lenguaje", "procesando..." o similares.
   - NUNCA respondas con bloques gigantes de texto. Mantén respuestas cortas (entre 2 y 5 líneas).
   - Usa emojis con moderación (máximo 2 o 3 por mensaje).

2. Filosofía de Servicio:
   - ¡PRIMERO AYUDA, DESPUÉS VENDE!
   - Responde exactamente la pregunta principal del cliente primero.
   - Haz máximo 1 pregunta por mensaje para no saturar la conversación.
   - Si el cliente está indeciso, recomienda máximo 2 opciones y explica brevemente por qué.

3. Conocimiento base de Restaurante Calientito:
   - DESAYUNOS: huevos al gusto, omelettes, enfrijoladas, chilaquiles y paquetes matutinos.
   - BEBIDAS: café, té, chocolate, jugos, licuados, aguas, refrescos y frappés.
   - COMIDA CORRIDA: menú de tres tiempos con agua y postre cuando está disponible.
   - SERVICIOS: consumo en sucursal, para llevar y a domicilio.
   - PROGRAMA VIP: sellos y recompensas según la configuración vigente.
   - Siempre prioriza los datos dinámicos que reciba el sistema sobre estos ejemplos generales.

4. Cierre y empatía:
   - Despide amablemente asegurando que todo quede claro.
   - Si el cliente menciona alguna restricción o preferencia, adáptate con respeto.
`;

const OWNER_SYSTEM_INSTRUCTION = `
Eres Tita para Dueña, asistente operativa de Restaurante Calientito.
Tu función es ayudar a la dueña o administrador a entender la app, detectar pendientes y analizar el restaurante usando EXCLUSIVAMENTE los datos administrativos estructurados que recibes en cada solicitud.

REGLAS:
1. Habla en español de México, clara, breve y práctica.
2. No inventes ventas, pedidos, mesas, gastos, productos ni estados. Si un dato no está en el contexto, dilo claramente.
3. Diferencia entre HECHOS actuales y RECOMENDACIONES. No presentes una inferencia como hecho.
4. Para preguntas de la app, usa la guía incluida en adminContext.appGuide.
5. Para análisis, prioriza: solicitudes pendientes, comandas NUEVO/PREPARANDO/LISTO, estado de turno, ventas/gastos y productos más pedidos.
6. Si detectas algo que requiere atención, indícalo con prioridad: "Atención ahora", "Revisar pronto" o "Sin alerta".
7. No ejecutes acciones, no cambies datos y no prometas haber modificado nada. Eres analista y guía, no controlas Firestore directamente.
8. Mantén las respuestas normalmente entre 3 y 8 líneas. Usa listas cortas cuando ayuden.
9. Si la dueña pregunta "cómo estuvo el día" o similar, resume primero y después señala 1 o 2 cosas a revisar.
10. Si pregunta cómo hacer algo en la app, da pasos concretos usando los nombres reales de las pestañas.
`;

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userPrompt, dailyMenu, restaurantInfo, mode, adminContext } = req.body;
    const isOwnerMode = mode === 'owner';

    if (!ai) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      if (isOwnerMode) {
        const pending = adminContext?.today?.pendingTableRequests ?? 0;
        const newOrders = adminContext?.today?.newOrders ?? 0;
        const preparing = adminContext?.today?.preparingOrders ?? 0;
        return res.send(`Tita Dueña está disponible, pero falta configurar la llave de Gemini para análisis conversacional. Ahora mismo veo ${pending} solicitud(es) de mesa pendiente(s), ${newOrders} comanda(s) nueva(s) y ${preparing} en preparación.`);
      }
      if (dailyMenu && dailyMenu.isAvailable === false) {
        return res.send('¡Hola! 👋 Soy Tita. Por el momento la comida corrida no está disponible hoy, pero tenemos otras opciones de la carta. ¿Qué se te antoja? 😊');
      }
      return res.send('¡Hola! 👋 Soy Tita. ¿Qué se te antoja hoy? Puedo ayudarte con el menú, bebidas, paquetes y promociones. 😊');
    }

    let effectiveSystemInstruction = '';

    if (isOwnerMode) {
      const safeAdminContext = adminContext && typeof adminContext === 'object' ? adminContext : {};
      effectiveSystemInstruction = `${OWNER_SYSTEM_INSTRUCTION}\n\nCONTEXTO ADMINISTRATIVO ACTUAL (fuente de verdad para esta respuesta):\n${JSON.stringify(safeAdminContext, null, 2)}`;
    } else {
      const effectiveAddress = (restaurantInfo?.address || 'Calle la Fama 12, 14260 Tlalpan CDMX, México').trim();
      const effectiveWhatsapp = (restaurantInfo?.whatsapp || '55 7441 1437').trim();
      const effectiveHours = (restaurantInfo?.openingHours || 'Abiertos de 9:00 am a 5:30 pm').trim();
      const effectiveEcoDiscountPercent = restaurantInfo?.ecoDiscountPercent ?? 10;
      const effectiveEcoDiscountDesc = (restaurantInfo?.ecoDiscountDescription || '10% de descuento si el cliente trae sus propios recipientes o termo.').trim();
      const effectiveDeliveryFee = restaurantInfo?.deliveryFee ?? 25;
      const effectiveVipStamps = restaurantInfo?.vipStampsRequired ?? 5;
      const effectiveVipReward = (restaurantInfo?.vipRewardDescription || 'Al acumular 5 sellos, el cliente obtiene una recompensa.').trim();
      const effectiveServicePolicies = (restaurantInfo?.servicePolicies || 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.').trim();
      const effectiveActivePromotions = (restaurantInfo?.activePromotions || 'Consulta promociones vigentes.').trim();

      const dynamicRestaurantInfoInstruction = `
DATOS OFICIALES Y VIGENTES DEL RESTAURANTE:
- Horario: ${effectiveHours}
- Dirección: ${effectiveAddress}
- WhatsApp: ${effectiveWhatsapp}
- Costo de envío: $${effectiveDeliveryFee} MXN
- Descuento ecológico: ${effectiveEcoDiscountPercent}% (${effectiveEcoDiscountDesc})
- Calientito VIP: ${effectiveVipStamps} sellos para recompensa ("${effectiveVipReward}")
- Políticas y pagos: ${effectiveServicePolicies}
- Promociones vigentes: ${effectiveActivePromotions}

Estos datos tienen prioridad total sobre cualquier ejemplo general.
`.trim();

      let dynamicMenuInstruction = '';
      if (dailyMenu && typeof dailyMenu === 'object') {
        const isAvailable = dailyMenu.isAvailable !== false;
        const guarniciones = Array.isArray(dailyMenu.guarniciones) && dailyMenu.guarniciones.length > 0
          ? dailyMenu.guarniciones.filter(Boolean).join(', ')
          : [dailyMenu.guarnicion1, dailyMenu.guarnicion2].filter(Boolean).join(', ');

        dynamicMenuInstruction = `
MENÚ DEL DÍA ACTUAL:
Precio: $${dailyMenu.price ?? 90}
Entrada: ${dailyMenu.entrada || 'No especificada'}
Guisados: ${dailyMenu.platoFuerte || 'No especificado'}
Guarniciones: ${guarniciones || 'No especificadas'}
Agua: ${dailyMenu.aguaDelDia || 'Agua fresca del día'}
Postre: ${dailyMenu.postreDelDia || 'Postre del día'}
Disponible: ${isAvailable ? 'Sí' : 'No'}

Usa únicamente estos datos si preguntan por el menú del día.
`.trim();
      }

      effectiveSystemInstruction = [
        GIOBOT_SYSTEM_INSTRUCTION,
        dynamicRestaurantInfoInstruction,
        dynamicMenuInstruction,
      ].filter(Boolean).join('\n\n');
    }

    const conversationHistory = (messages || []).map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    const PRIMARY_MODEL = 'gemini-3.8-flash';
    const FALLBACK_MODEL = 'gemini-3.5-flash';

    const streamConfig = {
      contents: [
        ...conversationHistory,
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      config: {
        systemInstruction: effectiveSystemInstruction,
        temperature: isOwnerMode ? 0.35 : 0.7,
        topP: isOwnerMode ? 0.8 : 0.9,
      },
    };

    const isTemporaryError = (err: any) => {
      const status = err?.status || err?.code;
      const msg = (err?.message || String(err)).toLowerCase();
      return (
        status === 503 ||
        msg.includes('503') ||
        msg.includes('unavailable') ||
        msg.includes('high demand') ||
        msg.includes('service unavailable') ||
        msg.includes('temporarily')
      );
    };

    let responseStream: any = null;

    try {
      responseStream = await ai.models.generateContentStream({
        model: PRIMARY_MODEL,
        ...streamConfig,
      });
    } catch (primaryErr: any) {
      if (isTemporaryError(primaryErr)) {
        console.warn(`[Tita Chat] Aviso temporal en ${PRIMARY_MODEL}. Reintentando...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          responseStream = await ai.models.generateContentStream({
            model: PRIMARY_MODEL,
            ...streamConfig,
          });
        } catch {
          responseStream = await ai.models.generateContentStream({
            model: FALLBACK_MODEL,
            ...streamConfig,
          });
        }
      } else {
        try {
          responseStream = await ai.models.generateContentStream({
            model: FALLBACK_MODEL,
            ...streamConfig,
          });
        } catch {
          throw primaryErr;
        }
      }
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.flushHeaders?.();

    for await (const chunk of responseStream) {
      if (chunk.text) res.write(chunk.text);
    }
    res.end();
  } catch (err: any) {
    console.error('Error in Tita chat API:', err);
    if (!res.headersSent) {
      res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send('Tuve un inconveniente técnico. Intenta de nuevo en un momento.');
    } else {
      res.end();
    }
  }
});

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Restaurante Calientito server running at http://0.0.0.0:${PORT}`);
  });
}

main();