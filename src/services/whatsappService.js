const axios = require('axios');

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const META_TOKEN = process.env.META_TOKEN;

const enviarMensajeWhatsApp = async (numeroCliente, texto) => {
    
    try{
await axios({
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
        }
    })
    }catch (error){
        console.log(error)
    }
};

module.exports = { enviarMensajeWhatsApp };