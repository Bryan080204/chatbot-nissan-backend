const axios = require('axios');

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const META_TOKEN = process.env.META_TOKEN;
const TIMEOUT_MS = Number(process.env.WA_API_TIMEOUT) || 15000;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const enviarMensajeWhatsApp = async (numeroCliente, texto, intentos = 2) => {
  const opciones = {
    method: 'POST',
    url: `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`,
    headers: {
      'Authorization': `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json'
    },
    data: {
      messaging_product: 'whatsapp',
      to: numeroCliente,
      type: 'text',
      text: { body: texto }
    },
    timeout: TIMEOUT_MS
  };

  for (let intento = 1; intento <= intentos; intento++) {
    try {
      await axios(opciones);
      return true;
    } catch (error) {
      console.error(`Error enviando mensaje a Meta (intento ${intento}/${intentos}):`, error.message);
      if (intento < intentos) await dormir(1000 * intento);
    }
  }
  return false;
};

module.exports = { enviarMensajeWhatsApp };