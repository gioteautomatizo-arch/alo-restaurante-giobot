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
   - NUNCA respondas con bloques gigantes de texto. Mantén respuestas cortas (entre 2 y 5 líneas normalmente).
   - Usa emojis con moderación (máximo 2 o 3 por mensaje).

2. Filosofía de Servicio:
   - ¡PRIMERO AYUDA, DESPUÉS VENDE!
   - Responde exactamente la pregunta principal del cliente primero.
   - Haz máximo 1 pregunta por mensaje para no saturar la conversación.
   - Si el cliente está indeciso, recomienda máximo 2 opciones y explica brevemente por qué.
   - Si tienes contexto de mesa, úsalo de forma natural: número de mesa, persona seleccionada, mesero asignado y lo que ya está en el carrito.

3. Conocimiento y fuente de verdad:
   - Siempre prioriza el catálogo real, el menú del día, la información vigente del restaurante y customerContext.
   - NO inventes platillos, precios, extras, tamaños, promociones ni disponibilidad.
   - Si un producto no aparece en menuCatalog, di que no puedes confirmarlo y ofrece alternativas reales del catálogo.
   - Si preguntan "¿qué llevo?", "¿cuánto llevo?", "¿cuánto va mi cuenta?" o algo equivalente, usa primero customerContext.consumption, que representa las comandas YA ENVIADAS de la sesión actual.
   - Distingue claramente entre customerContext.consumption (consumo ya enviado) y customerContext.cart (productos todavía en el carrito). Nunca sumes el carrito al consumo salvo que el cliente pregunte explícitamente por ambos.
   - Si preguntan por su mesa o mesero, usa customerContext.table. Si no hay dato, no lo inventes.

4. Servicio en mesa:
   - Puedes explicar cómo llamar al mesero o pedir servicio desde la interfaz de la mesa.
   - NO ejecutes solicitudes ni cambios por tu cuenta y no prometas haberlos enviado.
   - Si preguntan por cuenta, tortillas, bebidas u otro servicio, indica que usen los botones de atención de su mesa o llamen al mesero.
   - Nunca reveles información administrativa, ventas, gastos, usuarios, inventario interno, métricas, bitácora ni datos de otras mesas.

5. Recomendaciones:
   - Para recomendar, usa primero productos populares y disponibles del catálogo real.
   - Considera lo que ya pidió el cliente para sugerir una bebida o complemento coherente sin repetir de más.
   - Si menciona alergias o restricciones, no asegures que algo es seguro si no tienes información de ingredientes; recomienda confirmar con el personal.

6. Cierre y empatía:
   - Despide amablemente asegurando que todo quede claro.
   - Si el cliente menciona alguna restricción o preferencia, adáptate con respeto.
`;

const OWNER_SYSTEM_INSTRUCTION = `
Eres Tita Administrativa, asistente operativa de Restaurante Calientito.
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
    const {
      messages,
      userPrompt,
      dailyMenu,
      restaurantInfo,
      mode,
      adminContext,
      menuCatalog,
      customerContext,
    } = req.body;

    const isOwnerMode = mode === 'owner';

    if (!ai) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      if (isOwnerMode) {
        const pending = adminContext?.today?.pendingTableRequests ?? 0;
        const newOrders = adminContext?.today?.newOrders ?? 0;
        const preparing = adminContext?.today?.preparingOrders ?? 0;
        return res.send(`Tita Administrativa está disponible, pero falta configurar la llave de Gemini para análisis conversacional. Ahora mismo veo ${pending} solicitud(es) de mesa pendiente(s), ${newOrders} comanda(s) nueva(s) y ${preparing} en preparación.`);
      }
      if (dailyMenu && dailyMenu.isAvailable === false) {
        return res.send('¡Hola! 👋 Soy Tita. Por el momento la comida corrida no está disponible hoy, pero tenemos otras opciones de la carta. ¿Qué se te antoja? 😊');
      }
      return res.send('¡Hola! 👋 Soy Tita. Puedo ayudarte con la carta, recomendaciones, bebidas y tu servicio en mesa. ¿Qué se te antoja hoy? 😊');
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

      const safeCatalog = Array.isArray(menuCatalog)
        ? menuCatalog.slice(0, 120).map((item: any) => ({
            id: item?.id,
            name: item?.name,
            category: item?.category,
            description: item?.description,
            price: item?.price,
            sizes: item?.sizes,
            options: item?.options,
            extras: item?.extras,
            popular: Boolean(item?.popular),
          }))
        : [];

      const safeCustomerContext = customerContext && typeof customerContext === 'object'
        ? customerContext
        : { serviceMode: 'GENERAL', table: null, cart: { items: [], itemCount: 0, total: 0 } };

      const catalogInstruction = `
CATÁLOGO REAL DISPONIBLE PARA EL CLIENTE:
${JSON.stringify(safeCatalog, null, 2)}

REGLA: no recomiendes ni cotices productos que no estén aquí, salvo el menú del día si está incluido arriba.
`.trim();

      const customerContextInstruction = `
CONTEXTO ACTUAL DEL COMENSAL:
${JSON.stringify(safeCustomerContext, null, 2)}

Usa este contexto para responder preguntas sobre su mesa, persona seleccionada, consumo ya enviado y carrito. Si preguntan por el total de la cuenta, responde con customerContext.consumption.total. Si preguntan por lo que lleva la persona seleccionada, usa customerContext.consumption.selectedPersonTotal. Nunca menciones datos de otras mesas.
`.trim();

      effectiveSystemInstruction = [
        GIOBOT_SYSTEM_INSTRUCTION,
        dynamicRestaurantInfoInstruction,
        dynamicMenuInstruction,
        catalogInstruction,
        customerContextInstruction,
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
        temperature: isOwnerMode ? 0.35 : 0.55,
        topP: isOwnerMode ? 0.8 : 0.85,
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