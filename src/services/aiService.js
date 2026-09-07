const { ai, geminiConfig } = require('../config/gemini');
const { identificarIntencion } = require('./intentService');
const { obtenerInventario, obtenerCitas, registrarConsultaDB } = require('../repositories/sqlQueryRepository');
const { obtenerHistorial } = require('../repositories/messageRepository');

const formatearInventario = (productos) => {
  let texto = "INVENTARIO Y STOCK EN BASE DE DATOS EN TIEMPO REAL:\n";
  productos.forEach((p) => {
    const estadoStock = p.stock > 0 ? `${p.stock} unidades disponibles` : "SIN STOCK (AGOTADO)";
    texto += `- [${p.categoria.toUpperCase()}] ${p.nombreProducto} (${p.descripcion}): $${p.precio} MXN | Estado: ${estadoStock}\n`;
  });
  return texto;
};

const formatearCitas = (citas) => {
  let texto = "HORARIOS OCUPADOS (NO DISPONIBLES EN SISTEMA):\n";
  if (citas.length > 0) {
    citas.forEach((c) => {
      texto += `- Ocupado el ${c.fechaHora.toLocaleString()} para: ${c.servicio}\n`;
    });
  } else {
    texto += "- No hay citas agendadas por el momento.\n";
  }
  return texto;
};

const construirPrompt = (datosBD, historial, textoCliente) => `Eres el asesor comercial virtual de agencias Nissan México.

INFORMACIÓN DE LA BASE DE DATOS EN TIEMPO REAL:
${datosBD}

HORARIOS DISPONIBLES PARA AGENDAR CITAS:
- Lunes a Viernes: 9:00 AM a 6:00 PM.
- Sábados: 9:00 AM a 2:00 PM.
- Domingos: Cerrado.

REGLAS DE ATENCIÓN OBLIGATORIAS:
1. EXCLUSIVIDAD NISSAN: Solo responde temas sobre autos, baterías, refacciones o citas Nissan. Si preguntan por otras marcas, clima o temas ajenos, responde:
   "Lo siento, únicamente puedo brindarte información sobre vehículos, baterías, refacciones y citas para agencias Nissan. ¿En qué modelo o servicio te gustaría que te ayude?"
2. PRODUCTOS Y RECOMENDACIONES:
   - Responde precios y existencias basados únicamente en el inventario real de arriba.
   - Si piden un producto o modelo que esté "SIN STOCK (AGOTADO)", avísale al cliente y RECOMIÉNDALE inmediatamente una alternativa disponible con su precio.
3. CITAS: Para agendar citas de manejo o servicio, valida que no se solape con los horarios ocupados y solicita confirmar el modelo y la hora dentro de los horarios permitidos.
4. Mantén un tono formal, comercial y conciso.

Historial de chat reciente:
${historial.length > 0
    ? historial.map((h) => `Cliente: ${h.mensajeUsuario}\nAsesor Nissan: ${h.respuestaBot}`).join('\n')
    : '- Conversación nueva, sin historial previo.'}

Cliente: ${textoCliente}
Asesor Nissan:`;

const obtenerDatosPorIntencion = async (intencion) => {
  if (intencion === 'CITAS') {
    const citas = await obtenerCitas();
    return formatearCitas(citas);
  }
  if (intencion === 'INVENTARIO') {
    const inventario = await obtenerInventario();
    return formatearInventario(inventario);
  }
  return "No aplica consulta estructurada: responde con IA pura (conocimiento general de la agencia Nissan).";
};

const generarRespuesta = async ({ numeroCliente, textoCliente }) => {
  const intencion = identificarIntencion(textoCliente);

  const datosBD = await obtenerDatosPorIntencion(intencion);
  const historial = await obtenerHistorial(numeroCliente);
  const prompt = construirPrompt(datosBD, historial, textoCliente);

  await registrarConsultaDB(`IA_${intencion}`, prompt);

  const geminiResponse = await ai.models.generateContent({
    model: geminiConfig.model,
    contents: prompt,
  });

  return geminiResponse.text || "Hola, ¿en qué te puedo ayudar hoy con tu Nissan?";
};

module.exports = { generarRespuesta };