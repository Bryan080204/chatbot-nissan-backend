const { GoogleGenAI } = require('@google/genai');

const geminiConfig = {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
};

const ai = new GoogleGenAI({ apiKey: geminiConfig.apiKey });

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateContentConReintentos = async ({ model, contents }, intentos = 6) => {
  let ultimoError = null;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await ai.models.generateContent({ model, contents });
    } catch (error) {
      ultimoError = error;
      const esTransitorio =
        error?.status === 429 ||
        error?.status === 503 ||
        error?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error?.message?.includes('fetch failed');
      if (!esTransitorio || intento === intentos) break;
      const espera = Math.min(1500 * Math.pow(2, intento - 1), 30000);
      console.log(`Intento ${intento}/${intentos} falló (${error.message.slice(0, 80)}). Reintentando en ${espera / 1000}s...`);
      await dormir(espera);
    }
  }
  throw ultimoError;
};

module.exports = { ai, geminiConfig, generateContentConReintentos };



