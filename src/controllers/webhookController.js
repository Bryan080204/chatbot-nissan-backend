const { encolar } = require('../services/messageQueue');
const { registrarMensaje, registrarRespuestaBot } = require('../repositories/messageRepository');
const whatsappService = require('../services/whatsappService');
const aiService = require('../services/aiService');

const LIMITE_TEXTO_MENSAJE = 1000;
const RETENCION_DUPLICADOS_MS = 30 * 60 * 1000;
const MAX_DUPLICADOS = 50000;

const mensajesVistos = new Map();

function limpiarDuplicados() {
  if (mensajesVistos.size <= MAX_DUPLICADOS) return;
  const limite = Date.now() - RETENCION_DUPLICADOS_MS;
  for (const [id, ts] of mensajesVistos) {
    if (ts < limite) mensajesVistos.delete(id);
  }
}

function esDuplicado(id) {
  if (!id) return false;
  limpiarDuplicados();
  if (mensajesVistos.has(id)) return true;
  mensajesVistos.set(id, Date.now());
  return false;
}

const procesarMensaje = async (numeroTelefono, textoUsuario) => {
  try {
    const idMensaje = await registrarMensaje(numeroTelefono, textoUsuario);

    if (textoUsuario === '' || textoUsuario.length < 2 || textoUsuario.trim().toLowerCase().includes('asd')) {
      return;
    }

    let respuestaBot = '';
    try {
      respuestaBot = await aiService.procesarPreguntaCliente({
        numeroCliente: numeroTelefono,
        textoCliente: textoUsuario,
      });
    } catch (error) {
      respuestaBot = "En este momento tengo problemas para procesar tu solicitud. Intenta de nuevo en unos minutos.";
    }

    await whatsappService.enviarMensajeWhatsApp(numeroTelefono, respuestaBot);
    await registrarRespuestaBot(idMensaje, respuestaBot);
  } catch (error) {
    console.error("Error procesando solicitud:", error.message);
  }
};

const recibirWebhook = (req, res) => {
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (!body || body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const messages = change.value && change.value.messages;
      if (!messages || messages.length === 0) continue;

      for (const mensajeObj of messages) {
        if (mensajeObj.type && mensajeObj.type !== 'text') continue;
        if (esDuplicado(mensajeObj.id)) continue;

        const numeroTelefono = mensajeObj.from;
        const textoUsuario = (mensajeObj.text && mensajeObj.text.body || '').slice(0, LIMITE_TEXTO_MENSAJE);

        encolar(() => procesarMensaje(numeroTelefono, textoUsuario));
      }
    }
  }
};

const verificarWebhook = (req, res) => {
  const VERIFY_TOKEN = process.env.TOKEN_VERIFICACION || 'nissan123';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log("QUERY RECIBIDA DE META:", req.query);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED: ¡Verificado con éxito!');
    return res.status(200).send(challenge);
  }

  console.log('Error de verificación: Token incorrecto o faltan datos.');
  return res.sendStatus(403);
};

module.exports = { recibirWebhook, verificarWebhook };