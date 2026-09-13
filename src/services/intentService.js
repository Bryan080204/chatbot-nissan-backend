const { geminiConfig, generateContentConReintentos } = require('../config/gemini');

const identificarIntencion = async (textoUsuario) => {
  if (!textoUsuario || textoUsuario.trim().length < 2) {
    return 'GENERAL';
  }

  const promptClasificacion = `
    Eres un sistema de clasificación de intenciones para una agencia de autos Nissan.
    Analiza la siguiente pregunta del cliente y determina su intención principal.
    
    Categorías permitidas (responde SOLO con una de estas palabras exactas):
    - citas: Si busca agendar citas, horarios de servicio, mantenimiento o talleres.
    - precios: Si busca precios, costos, disponibilidad en tienda o stock de productos.
    - info_nissan: Si pregunta sobre especificaciones de autos, marcas, modelos, comparativas o información técnica de vehículos Nissan.
    - general: Si es un saludo, agradecimiento o pregunta que no encaja en las anteriores.

    Pregunta del cliente: "${textoUsuario}"
  `;

  try {
    const respuesta = await generateContentConReintentos({
      model: geminiConfig.model,
      contents: promptClasificacion,
    });
    
    const textoRespuesta = (respuesta.text || '').trim().toLowerCase();
    
    if (textoRespuesta.includes('citas')) return 'citas';
    if (textoRespuesta.includes('precios')) return 'precios';
    if (textoRespuesta.includes('info_nissan')) return 'info_nissan';
    
    return 'general';
  } catch (error) {
    console.error("Error clasificando intención con IA:", error);
    // Fallback simple por si falla la IA
    const t = textoUsuario.toLowerCase();
    if (t.includes('cita') || t.includes('horario')) return 'citas';
    if (t.includes('precio') || t.includes('costo')) return 'precios';
    return 'general';
  }
};

module.exports = { identificarIntencion };