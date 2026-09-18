const { registrarMensaje, registrarRespuestaBot } = require('../repositories/messageRepository');
const whatsappService = require('../services/whatsappService');
const aiService = require('../services/aiService');

const recibirWebhook = async (req, res) => {
    res.status(200).send('EVENT_RECEIVED');
    console.log("recibiendo mensaje");
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value.messages && change.value.messages.length > 0) {
                        const mensajeObj = change.value.messages[0];
                        console.log("Mensaje: "+mensajeObj);
                        const numeroTelefono = mensajeObj.from;
                        const textoUsuario = mensajeObj.text ? mensajeObj.text.body : '';
                        const jsonString = JSON.stringify(body);

                        const idMensaje = await registrarMensaje(numeroTelefono, textoUsuario, jsonString);
                        let respuestaBot = '';

                        if (textoUsuario === '' || textoUsuario.length < 2 || textoUsuario.trim().toLowerCase().includes('asd')) {
                            return;
                        }

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
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error procesando solicitud:", error);
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