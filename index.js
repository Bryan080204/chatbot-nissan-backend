const express = require('express');
const axios = require('axios');
const sql = require('mssql');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());

// CONFIGURACIÓN DE CONEXIÓN A SQL SERVER
const dbConfig = {
    server: '127.0.0.1',
    database: 'ChatbotNissanDB',
    user: 'sa',
    password: '080204Bryan',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const TOKEN_VERIFICACION = "nissan123";
const META_TOKEN = "AQUÍ_VA_TU_META_TOKEN"; 
const PHONE_NUMBER_ID = "1297007906829228"; 
const GEMINI_API_KEY = "AQUÍ_VA_TU_GEMINI_KEY";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Conectar a SQL Server
sql.connect(dbConfig)
    .then(() => console.log("-> Conexión exitosa a SQL Server (ChatbotNissanDB)"))
    .catch(err => console.error("Error conectando a SQL Server:", err.message));

// Webhook GET (Verificación Meta)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === TOKEN_VERIFICACION) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Webhook POST (Recepción de mensajes)
app.post('/webhook', async (req, res) => {
    res.status(200).send('EVENT_RECEIVED');

    try {
        const mensajeObj = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!mensajeObj || !mensajeObj.text?.body) return;

        const numeroCliente = mensajeObj.from;
        const textoCliente = mensajeObj.text.body;

        console.log(`\n========================================`);
        console.log(`Mensaje Recibido de: ${numeroCliente}`);
        console.log(`Texto: "${textoCliente}"`);

        const pool = await sql.connect(dbConfig);

        // 1. Registrar cliente en dbo.Clientes si es nuevo
        await pool.request()
            .input('numero', sql.VarChar, numeroCliente)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM Clientes WHERE NumeroTelefono = @numero)
                BEGIN
                    INSERT INTO Clientes (NumeroTelefono) VALUES (@numero)
                END
            `);

        // 2. Guardar mensaje recibido en dbo.Mensajes
        await pool.request()
            .input('numero', sql.VarChar, numeroCliente)
            .input('rol', sql.VarChar, 'user')
            .input('mensaje', sql.NVarChar, textoCliente)
            .query('INSERT INTO Mensajes (NumeroTelefono, Rol, Contenido) VALUES (@numero, @rol, @mensaje)');

        // 3. Consultar Inventario completo en tiempo real
        const resultInventario = await pool.request().query('SELECT Categoria, NombreProducto, Descripcion, Precio, Stock FROM Inventario');
        let textoInventario = "INVENTARIO Y STOCK EN BASE DE DATOS EN TIEMPO REAL:\n";
        resultInventario.recordset.forEach(p => {
            const estadoStock = p.Stock > 0 ? `${p.Stock} unidades disponibles` : "SIN STOCK (AGOTADO)";
            textoInventario += `- [${p.Categoria.toUpperCase()}] ${p.NombreProducto} (${p.Descripcion}): $${p.Precio} MXN | Estado: ${estadoStock}\n`;
        });

        // 4. Consultar Citas ocupadas en tiempo real
        const resultCitas = await pool.request().query('SELECT FechaHora, Servicio FROM Citas WHERE Estado = \'Confirmada\'');
        let textoCitasOcupadas = "HORARIOS OCUPADOS (NO DISPONIBLES EN SISTEMA):\n";
        if (resultCitas.recordset.length > 0) {
            resultCitas.recordset.forEach(c => {
                textoCitasOcupadas += `- Ocupado el ${c.FechaHora.toLocaleString()} para: ${c.Servicio}\n`;
            });
        } else {
            textoCitasOcupadas += "- No hay citas agendadas por el momento.\n";
        }

        // 5. Historial reciente del chat
        const resultHistorial = await pool.request()
            .input('numero', sql.VarChar, numeroCliente)
            .query('SELECT TOP 6 Rol, Contenido FROM Mensajes WHERE NumeroTelefono = @numero ORDER BY Id DESC');
        
        const historialMensajes = resultHistorial.recordset.reverse();

        // 6. System Prompt con Reglas Estrictas
        const systemPrompt = `Eres el asesor comercial virtual de agencias Nissan México.

INFORMACIÓN DE LA BASE DE DATOS EN TIEMPO REAL:
${textoInventario}

${textoCitasOcupadas}

HORARIOS DISPONIBLES PARA AGENDAR CITAS:
- Lunes a Viernes: 9:00 AM a 6:00 PM.
- Sábados: 9:00 AM a 2:00 PM.
- Domingos: Cerrado.

REGLAS DE ATENCIÓN OBLIGATORIAS:
1. EXCLUSIVIDAD NISSAN: Solo responde temas sobre autos, baterías, refacciones o citas Nissan. Si preguntan por otras marcas, clima o temas ajenos, responde:
   "Lo siento, únicamente puedo brindarte información sobre vehículos, baterías, refacciones y citas para agencias Nissan. ¿En qué modelo o servicio te gustaría que te ayude?"
2. PRODUCTOS Y RECOMENDACIONES:
   - Responde precios y existencias basados únicamente en el inventario real de arriba.
   - Si piden un producto o modelo que esté "SIN STOCK (AGOTADO)", avísale al cliente y RECOMIÉNDALE inmediatamente una alternativa disponible con su precio (ejemplo: si la Kicks está agotada, sugiere el Sentra o Versa).
3. CITAS: Para agendar citas de manejo o servicio, valida que no se solape con los horarios ocupados y solicita confirmar el modelo y la hora dentro de los horarios permitidos.
4. Mantén un tono formal, comercial y conciso.`;

        let contextoConversacion = `${systemPrompt}\n\nHistorial de chat reciente:\n`;
        historialMensajes.forEach(h => {
            const speaker = h.Rol === 'user' ? 'Cliente' : 'Asesor Nissan';
            contextoConversacion += `${speaker}: ${h.Contenido}\n`;
        });
        contextoConversacion += `Cliente: ${textoCliente}\nAsesor Nissan:`;

        // 7. Generar respuesta con Gemini
        const geminiResponse = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: contextoConversacion,
        });

        const textoRespuesta = geminiResponse.text || "Hola, ¿en qué te puedo ayudar hoy con tu Nissan?";
        console.log(`Respuesta IA: "${textoRespuesta}"`);

        // 8. Guardar la respuesta en dbo.Mensajes
        await pool.request()
            .input('numero', sql.VarChar, numeroCliente)
            .input('rol', sql.VarChar, 'assistant')
            .input('mensaje', sql.NVarChar, textoRespuesta)
            .query('INSERT INTO Mensajes (NumeroTelefono, Rol, Contenido) VALUES (@numero, @rol, @mensaje)');

        // 9. Enviar mensaje por WhatsApp
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
                text: { body: textoRespuesta }
            }
        });

    } catch (error) {
        console.error("Error procesando solicitud:", error.message);
    }
});

app.listen(3000, () => {
    console.log('Servidor corriendo en el puerto 3000 (Nissan Bot Activo)');
});