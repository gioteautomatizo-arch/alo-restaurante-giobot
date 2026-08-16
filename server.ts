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
    const { messages, userPrompt } = req.body;

    if (!ai) {
      // Fallback if no API key is set yet
      return res.json({
        text: '¡Hola! 👋 Bienvenido a ¡Aló! Restaurante. Soy Giobot. ¿Qué se te antoja hoy? Te puedo recomendar un rico café de olla, unos chilaquiles o nuestra Comida Corrida del día. 😊',
      });
    }

    // Build chat conversation context
    const conversationHistory = (messages || []).map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    // Generate response using Gemini 3.6 Flash
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        ...conversationHistory,
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      config: {
        systemInstruction: GIOBOT_SYSTEM_INSTRUCTION,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const text = response.text || '¡Con gusto te ayudo! ¿En qué más puedo apoyarte? 😊';
    return res.json({ text });
  } catch (err: any) {
    console.error('Error in Giobot chat API:', err);
    return res.json({
      text: '¡Uy, disculpa la molestia! Tuve un pequeño inconveniente técnico. Pero con gusto te puedo mostrar nuestro menú o tomar tu pedido. 😊',
    });
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
