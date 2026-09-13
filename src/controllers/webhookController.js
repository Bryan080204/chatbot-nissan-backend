const { registrarMensaje, registrarRespuestaBot } = require('../repositories/messageRepository');
const whatsappService = require('../services/whatsappService');
const aiService = require('../services/aiService'); // O tu servicio de IA correspondiente

const recibirWebhook = async (req, res) => {
    // Responder inmediatamente a Meta con 200 OK para evitar bloqueos de reintento
    res.status(200).send('EVENT_RECEIVED');

    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value.messages && change.value.messages.length > 0) {
                        const mensajeObj = change.value.messages[0];
                        const numeroTelefono = mensajeObj.from;
                        const textoUsuario = mensajeObj.text ? mensajeObj.text.body : '';
                        const jsonString = JSON.stringify(body);

                        console.log(`=======================================`);
                        console.log(`Mensaje Recibido de: ${numeroTelefono}`);
                        console.log(`Texto: "${textoUsuario}"`);

                        // 1. Guardar el mensaje del usuario en la base de datos
                        const idMensaje = await registrarMensaje(numeroTelefono, textoUsuario, jsonString);

                        // 2. Clasificar la intención con IA y responder según corresponda (BD o IA)
                        let respuestaBot = '';

                        if (textoUsuario === '' || textoUsuario.length < 2 || textoUsuario.trim().toLowerCase().includes('asd')) {
                            console.log("Pregunta que no se responde");
                            return;
                        }

                        try {
                            respuestaBot = await aiService.procesarPreguntaCliente({
                                numeroCliente: numeroTelefono,
                                textoCliente: textoUsuario,
                            });
                        } catch (error) {
                            console.error("Error con IA:", error);
                            respuestaBot = "En este momento tengo problemas para procesar tu solicitud. Intenta de nuevo en unos minutos.";
                        }

                        // 3. Enviar respuesta por WhatsApp
                        await whatsappService.enviarMensajeWhatsApp(numeroTelefono, respuestaBot);

                        // 4. Guardar la respuesta del bot vinculada al mensaje del usuario
                        await registrarRespuestaBot(idMensaje, respuestaBot);
                        console.log(`Respuesta procesada y guardada exitosamente.`);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error procesando solicitud:", error);
    }
};

const verificarWebhook = (req, res) => {
    const VERIFY_TOKEN = process.env.TOKEN_VERIFICACION || 'TOKEN_SECRETO_NISSAN';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
};

module.exports = { recibirWebhook, verificarWebhook };