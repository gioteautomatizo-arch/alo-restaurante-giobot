import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini Client
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

// System Instruction for Giobot - Anfitrión Virtual de ¡Aló! Restaurante
const GIOBOT_SYSTEM_INSTRUCTION = `
Eres Giobot, el anfitrión virtual de ¡Aló! Restaurante.
Tu misión es recibir a cada cliente con amabilidad, resolver sus dudas, ayudarlo a elegir la mejor opción del menú y acompañarlo durante su experiencia.
No eres un simple chatbot ni una IA: representas la atención y el servicio cálido de ¡Aló! Restaurante.

REGLAS DE ORO:
1. Misión y Personalidad:
   - Amable, cercano, paciente, seguro, positivo y rápido.
   - Habla en español como una persona real en México (de 'tú').
   - NUNCA digas "como IA", "según mi programación", "como modelo de lenguaje", "procesando..." o similares.
   - NUNCA respondas con bloques gigantes de texto. Mantén respuestas cortas (entre 2 y 5 líneas).
   - Usa emojis con moderación (máximo 2 o 3 por mensaje).

2. Filosofía de Servicio:
   - ¡PRIMERO AYUDA, DESPUÉS VENDE!
   - Responde exactamente la pregunta principal del cliente primero.
   - Haz máximo 1 pregunta por mensaje para no saturar la conversación.
   - Si el cliente está indeciso, recomienda máximo 2 opciones y explica brevemente por qué.

3. Conocimiento de ¡Aló! Restaurante:
   - Menú:
     * BEBIDAS: Espresso ($25/$50/$28), Americano ($35/$40/$50), Cappuccino ($35/$40/$45), Latte ($40/$45/$50, sabor +$10, Baileys +$15), Chai ($45/$50/$55), Café de olla ($15/$25/$30), Chocolate ($35/$40/$45), Mocca ($40/$46/$50), Té ($20/$25/$30).
     * FRÍOS Y FRAPPÉS: Ice coffee ($50), Ice coffee c/leche ($60), Naranjada/Limonada mineral ($55), Té frío ($30), Frappé Mocca/Cookies/Frapuccino ($60-$65), Refrescos ($25).
     * LICUADOS, AGUAS Y JUGOS: Licuados 1 ingrediente (1/2L $40, 1L $75), Combinados (1/2L $45, 1L $85), Agua fresca (1/2L $30, 1L $55), Jugos (1/2L $40, 1L $75), Jugo Verde/Antigripal (1/2L $45, 1L $85), Cocktail de frutas ($50).
     * DESAYUNOS: Huevos al gusto ($70), Huevos al albañil ($80), Omelette de espinacas ($70), Omelette al gratin w/ hot cakes ($80), Enfrijoladas ($80), Chilaquiles ($80-$90). ¡Cualquiera se hace paquete con jugo/fruta + café/té por solo +$20!
     * MOLLETES Y TORTAS: Molletes ($60), Sincronizadas ($50), Tortas c/ papas ($75), Papas a la francesa ($60).
     * CHAPATAS Y SANDWICHES: Chapatas ($65-$80 c/ papas), Club Sandwich ($80), Sandwiches ($60).
     * HAMBURGUESAS: Sencilla ($60), Hawayana/Champiñón ($80), Hazla paquete con papas y refresco (+ $35).
     * COMIDA CORRIDA: $90 (Consumé/Sopa + Arroz/Pasta + Guisado/Enchiladas/Milanesa + 1/2L agua natural del día + postre).
     * ANTOJITOS Y ESPECIALIDADES: Tacos (2x $55), Tacos Arrachera (2x $70), Burritos ($75-$90), Enchiladas de mole ($90), Spaghetti Alfredo ($90), Pechuga Cordon Blue ($90), Alambre ($90).
     * ARMA TU ENSALADA: $90 (Base + Proteína + Fruta + Topping + Aderezo).
     * FIN DE SEMANA: Sábados Pozole rojo ($80 incl. agua/café), Domingos Pancita ($80 incl. agua/café).
     * SUSTENTABILIDAD Y DESCUENTO: ¡Si traes tus propios recipientes o termo para llevar, te hacemos un 10% DE DESCUENTO!
     * TARJETA ALÓ VIP: ¡Programa de Lealtad! Guarda los datos del cliente (nombre, teléfono, dirección) para que no tenga que escribirlos en cada pedido. Además acumula 1 sello por cada compra; ¡al juntar 5 sellos gana un café o postre del día gratis!
   - Horario de servicio: Abiertos de 9:00 am a 5:30 pm.
   - Ubicación: Calle la Fama 12, 14260 Tlalpan CDMX, México.
   - WhatsApp / Pedidos: 55 7441 1437.
   - Modalidades: Servicio en Sucursal (Comedor), Entrega a Domicilio y Anticipar orden / Para llevar.
   - Redes: IG @calientitocafe15 (https://www.instagram.com/calientitocafe15?igsh=Z3hzdmViZDVka2ho) | FB https://www.facebook.com/share/1Cvompzmgh/

4. Cierre y empatía:
   - Despide amablemente asegurando que todo quede claro.
   - Si el cliente menciona alguna restricción o preferencia, adáptate con respeto.
`;

// API endpoint for Giobot Chat
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userPrompt, dailyMenu, restaurantInfo } = req.body;

    if (!ai) {
      // Fallback if no API key is set yet
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      if (dailyMenu && dailyMenu.isAvailable === false) {
        return res.send('¡Hola! 👋 Bienvenido a ¡Aló! Restaurante. Soy Tita. Por el momento la comida corrida no está disponible hoy, pero tenemos ricos chilaquiles, hamburguesas, tortas y bebidas. ¿Qué se te antoja hoy? 😊');
      }
      return res.send('¡Hola! 👋 Bienvenido a ¡Aló! Restaurante. Soy Tita. ¿Qué se te antoja hoy? Te puedo recomendar un rico café de olla, unos chilaquiles o nuestra Comida Corrida del día. 😊');
    }

    // Información dinámica y oficial del restaurante (Firestore / fuente única de verdad)
    const effectiveAddress = (restaurantInfo?.address || 'Calle la Fama 12, 14260 Tlalpan CDMX, México').trim();
    const effectiveWhatsapp = (restaurantInfo?.whatsapp || '55 7441 1437').trim();
    const effectiveHours = (restaurantInfo?.openingHours || 'Abiertos de 9:00 am a 5:30 pm').trim();
    const effectiveEcoDiscountPercent = restaurantInfo?.ecoDiscountPercent ?? 10;
    const effectiveEcoDiscountDesc = (restaurantInfo?.ecoDiscountDescription || '10% de descuento si el cliente trae sus propios recipientes o termo.').trim();
    const effectiveDeliveryFee = restaurantInfo?.deliveryFee ?? 25;
    const effectiveVipStamps = restaurantInfo?.vipStampsRequired ?? 5;
    const effectiveVipReward = (restaurantInfo?.vipRewardDescription || 'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.').trim();
    const effectiveServicePolicies = (restaurantInfo?.servicePolicies || 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.').trim();
    const effectiveActivePromotions = (restaurantInfo?.activePromotions || '10% de descuento por traer recipientes propios.').trim();

    const dynamicRestaurantInfoInstruction = `
DATOS OFICIALES Y VIGENTES DEL RESTAURANTE (INFORMACIÓN DINÁMICA DE FIRESTORE):
- Horario de servicio: ${effectiveHours}
- Ubicación / Dirección: ${effectiveAddress}
- WhatsApp de Pedidos / Atención: ${effectiveWhatsapp}
- Costo de envío a domicilio: $${effectiveDeliveryFee} MXN
- Descuento ecológico: ${effectiveEcoDiscountPercent}% (${effectiveEcoDiscountDesc})
- Programa Calientito VIP: Acumular ${effectiveVipStamps} sellos para obtener recompensa ("${effectiveVipReward}")
- Políticas de servicio y formas de pago: ${effectiveServicePolicies}
- Promociones vigentes: ${effectiveActivePromotions}

REGLAS ESTRICTAS DE INFORMACIÓN DEL RESTAURANTE (PRIORIDAD TOTAL):
1. Estos datos tienen PRIORIDAD TOTAL Y ABSOLUTA sobre cualquier valor anterior, instrucción previa o regla estática.
2. Si el cliente pregunta dónde están ubicados, cuál es la dirección, cómo llegar, cuál es su horario, a qué hora abren o cierran, o cuál es su WhatsApp:
   * Dirección: "${effectiveAddress}"
   * Horario: "${effectiveHours}"
   * WhatsApp: "${effectiveWhatsapp}"
3. Si el cliente pregunta por promociones, descuentos, descuento ecológico o recipientes propios:
   * Descuento ecológico: ${effectiveEcoDiscountPercent}% (${effectiveEcoDiscountDesc}).
   * Promociones activas: "${effectiveActivePromotions}".
4. Si el cliente pregunta por servicio a domicilio o costo de entrega:
   * Costo de envío: $${effectiveDeliveryFee} MXN.
5. Si el cliente pregunta sobre la tarjeta o programa "Calientito VIP", sellos necesarios o recompensas:
   * Se acumulan sellos con cada compra registrada.
   * Se requieren exactamente ${effectiveVipStamps} sellos.
   * Recompensa: "${effectiveVipReward}".
6. Si el cliente pregunta por formas de pago (efectivo, transferencia, tarjeta) o formas de consumo (comedor, para llevar, a domicilio):
   * Políticas y pagos: "${effectiveServicePolicies}".
`.trim();

    // Contexto dinámico del Menú del Día en tiempo real (Firestore)
    let dynamicMenuInstruction = '';
    if (dailyMenu && typeof dailyMenu === 'object') {
      const isAvailable = dailyMenu.isAvailable !== false;
      const guarniciones = Array.isArray(dailyMenu.guarniciones) && dailyMenu.guarniciones.length > 0
        ? dailyMenu.guarniciones.filter(Boolean).join(', ')
        : [dailyMenu.guarnicion1, dailyMenu.guarnicion2].filter(Boolean).join(', ');

      dynamicMenuInstruction = `
MENÚ DEL DÍA ACTUAL (DATOS REALES EN VIVO DE FIRESTORE):
Precio: $${dailyMenu.price ?? 90}
Entrada: ${dailyMenu.entrada || 'No especificada'}
Guisados: ${dailyMenu.platoFuerte || 'No especificado'}
Guarniciones: ${guarniciones || 'No especificadas'}
Agua: ${dailyMenu.aguaDelDia || 'Agua fresca del día'}
Postre: ${dailyMenu.postreDelDia || 'Postre del día'}
Disponible: ${isAvailable ? 'Sí' : 'No'}

REGLAS DE PRIORIDAD DEL MENÚ DEL DÍA:
1. Estos datos dinámicos tienen PRIORIDAD TOTAL sobre cualquier ejemplo genérico de comida corrida o menú del día mencionado arriba.
2. Si el cliente pregunta qué hay de comer hoy, cuál es el menú del día, qué guisados tienen, qué agua hay hoy, qué postre tienen o qué incluye la comida corrida, responde usando ÚNICAMENTE estos datos reales.
3. Si "Disponible" es "No": indica de manera muy amable que la comida corrida no está disponible actualmente o se encuentra agotada por hoy, y sugiere amablemente otras opciones de nuestra carta (chilaquiles, tortas, hamburguesas, molletes, ensaladas, etc.).
`.trim();
    }

    const effectiveSystemInstruction = [
      GIOBOT_SYSTEM_INSTRUCTION,
      dynamicRestaurantInfoInstruction,
      dynamicMenuInstruction,
    ].filter(Boolean).join('\n\n');

    // Build chat conversation context
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
        temperature: 0.7,
        topP: 0.9,
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

    // 1. Intento inicial con modelo principal (gemini-3.8-flash)
    try {
      responseStream = await ai.models.generateContentStream({
        model: PRIMARY_MODEL,
        ...streamConfig,
      });
    } catch (primaryErr: any) {
      if (isTemporaryError(primaryErr)) {
        console.warn(`[Tita Chat] Aviso 503/UNAVAILABLE en ${PRIMARY_MODEL}. Reintentando en 1.5s...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        // 2. UN reintento automático con el modelo principal
        try {
          responseStream = await ai.models.generateContentStream({
            model: PRIMARY_MODEL,
            ...streamConfig,
          });
        } catch (retryErr: any) {
          console.warn(`[Tita Chat] Reintento en ${PRIMARY_MODEL} falló. Activando fallback a ${FALLBACK_MODEL}...`);
          // 3. Fallback al modelo verificado y disponible (gemini-3.5-flash)
          responseStream = await ai.models.generateContentStream({
            model: FALLBACK_MODEL,
            ...streamConfig,
          });
        }
      } else {
        // En caso de otro error no temporal, intentar fallback a modelo estable
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
      if (chunk.text) {
        res.write(chunk.text);
      }
    }
    res.end();
  } catch (err: any) {
    console.error('Error in Giobot chat API:', err);
    if (!res.headersSent) {
      res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send('¡Uy, disculpa la molestia! Tuve un pequeño inconveniente técnico. Pero con gusto te puedo mostrar nuestro menú o tomar tu pedido. 😊');
    } else {
      res.end();
    }
  }
});

// Vite Middleware & Static Serving Setup
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
    console.log(`¡Aló! Restaurante server running at http://0.0.0.0:${PORT}`);
  });
}

main();
