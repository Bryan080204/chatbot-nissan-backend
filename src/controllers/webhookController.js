const { sql } = require('../config/database');
const { registrarClienteSiNuevo } = require('../repositories/userRepository');
const { registrarMensaje } = require('../repositories/messageRepository');
const { obtenerInventario, obtenerCitas } = require('../repositories/sqlQueryRepository');

const TOKEN_VERIFICACION = process.env.TOKEN_VERIFICACION || 'nissan123';
const LIMITE_MENSAJE = 500;

const verificarWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === TOKEN_VERIFICACION) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
};

const recibirMensaje = async (req, res) => {
    res.status(200).send('EVENT_RECEIVED');

    try {
        const mensajeObj = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!mensajeObj || !mensajeObj.text?.body) return;

        const numeroCliente = mensajeObj.from;
        const textoCliente = mensajeObj.text.body.slice(0, LIMITE_MENSAJE);

        console.log(`\n========================================`);
        console.log(`Mensaje Recibido de: ${numeroCliente}`);
        console.log(`Texto: "${textoCliente}"`);

        // 1. Registrar cliente (número, nombre y fecha de creación)
        await registrarClienteSiNuevo(numeroCliente);

        // 2. Guardar el mensaje en la tabla Mensajes
        await registrarMensaje(numeroCliente, textoCliente, "Pendiente de procesamiento");

        // 3. Analizar intención de forma local sin IA
        const t = textoCliente.toLowerCase().trim();
        let categoria = 'IA';

        if (t === '' || t.length < 2 || t.includes('jaja') || t.includes('asd')) {
            categoria = 'INVALIDO';
        } else if (t.includes('cita') || t.includes('servicio') || t.includes('horario')) {
            categoria = 'CITAS';
        } else if (t.includes('refaccion') || t.includes('pieza') || t.includes('bateria') || t.includes('auto') || t.includes('precio') || t.includes('versa') || t.includes('x-trail') || t.includes('sentra') || t.includes('kicks')) {
            categoria = 'INVENTARIO';
        }

        // 4. Estructura switch exigida para clasificar e imprimir en consola
        switch (categoria) {
            case 'INVALIDO':
                console.log("pregunta que no se responde");
                break;

            case 'CITAS':
                console.log("pregunta para consultar en base de datos");
                await obtenerCitas();
                break;

            case 'INVENTARIO':
                console.log("pregunta para consultar en base de datos");
                await obtenerInventario();
                break;

            case 'IA':
            default:
                console.log("pregunta para inteligencia");
                break;
        }

        // 5. Pasos de IA y WhatsApp comentados por instrucciones del ingeniero:
        /*
        const respuestaBot = "Respuesta simulada";
        await registrarMensaje(numeroCliente, textoCliente, respuestaBot);
        await enviarMensajeWhatsApp(numeroCliente, respuestaBot);
        */

    } catch (error) {
        console.error("Error procesando solicitud:", error.message);
    }
};

module.exports = { verificarWebhook, recibirMensaje };