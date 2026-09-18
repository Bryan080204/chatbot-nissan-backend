const { geminiConfig, generateContentConReintentos } = require('../config/gemini');
const { identificarIntencion } = require('./intentService');
const {
  obtenerInventario,
  obtenerCitas,
  obtenerCitasPorNumeroCliente,
  obtenerCitaPorId,
  registrarConsultaDB,
  obtenerIdClientePorNumero,
  existeCitaEnHorario,
  registrarCita,
} = require('../repositories/sqlQueryRepository');
const { obtenerHistorial } = require('../repositories/messageRepository');

const LIMITE_CARACTERES_RESPUESTA = 450;
const MENSAJE_ERROR_IA = "En este momento tengo problemas para conectarme, pero tu mensaje ya fue registrado. Intenta de nuevo en unos minutos, por favor.";

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

const formatearCitasCliente = (citas) => {
  const lineas = citas.map((c, i) => {
    const fechaTexto = c.fechaHora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const horaTexto = c.fechaHora.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
    return `${i + 1}. ♻️ No. de cita: ${c.id} | 🔧 ${c.servicio} | 📅 ${fechaTexto} | ⏰ ${horaTexto}`;
  });
  return `Estas son tus citas agendadas en Nissan:\n\n${lineas.join('\n')}`;
};

const construirPromptRespuesta = ({ datosBD, historial, textoCliente, intencion }) => `Eres el asesor comercial virtual de agencias Nissan México.

PREGUNTA DEL CLIENTE:
"${textoCliente}"

DATOS OBTENIDOS DE LA BASE DE DATOS (cuando aplique a la intención "${intencion}"):
${datosBD}

HORARIOS DISPONIBLES PARA AGENDAR CITAS:
- Lunes a Viernes: 9:00 AM a 6:00 PM.
- Sábados: 9:00 AM a 2:00 PM.
- Domingos: Cerrado.

REGLAS OBLIGATORIAS DE LA RESPUESTA:
1. SOLO responde sobre la marca NISSAN: autos, modelos, baterías, refacciones, precios o citas de agencias Nissan.
2. Si la pregunta es sobre otra marca, clima o cualquier tema ajeno a Nissan, responde ÚNICAMENTE con la siguiente frase y nada más:
   "Lo siento, únicamente puedo brindarte información sobre vehículos, baterías, refacciones y citas para agencias Nissan. ¿En qué modelo o servicio te gustaría que te ayude?"
3. CAPACIDAD MÁXIMA: Tu respuesta NO debe superar los ${LIMITE_CARACTERES_RESPUESTA} caracteres. Sé breve, directo y al punto.
4. Usa ÚNICAMENTE los datos del inventario y citas proporcionados arriba para responder precios, stock y disponibilidad.
5. Si el producto o modelo está agotado (SIN STOCK), avísalo y recomienda una alternativa disponible con su precio.
6. Mantén un tono formal, comercial y conciso.

Historial de chat reciente:
${historial.length > 0
    ? historial.map((h) => `Cliente: ${h.mensajeUsuario}\nAsesor Nissan: ${h.respuestaBot}`).join('\n')
    : '- Conversación nueva, sin historial previo.'}

Cliente: ${textoCliente}
Asesor Nissan:`;

const obtenerDatosPorIntencion = async (intencion) => {
  if (intencion === 'citas') {
    const citas = await obtenerCitas();
    return formatearCitas(citas);
  }
  if (intencion === 'precios') {
    const inventario = await obtenerInventario();
    return formatearInventario(inventario);
  }
  return "No aplica consulta estructurada: la IA responde con su conocimiento sobre la marca Nissan.";
};

const generarRespuestaGemini = async ({ textoCliente, datosBD, historial, intencion }) => {
  const prompt = construirPromptRespuesta({ datosBD, historial, textoCliente, intencion });
  await registrarConsultaDB(`IA_RESPUESTA_${intencion}`, prompt);
  try {
    const geminiResponse = await generateContentConReintentos({
      model: geminiConfig.model,
      contents: prompt,
    });
    const respuesta = geminiResponse.text || "Hola, ¿en qué te puedo ayudar hoy con tu Nissan?";
    return respuesta.length > LIMITE_CARACTERES_RESPUESTA
      ? respuesta.slice(0, LIMITE_CARACTERES_RESPUESTA)
      : respuesta;
  } catch (error) {
    console.error("Error generando respuesta de IA:", error.message);
    return MENSAJE_ERROR_IA;
  }
};

const esConsultaCitaExplicita = (texto) => {
  const t = (texto || '').toLowerCase();
  if (/\bagendar|reservar|separar\b/.test(t)) return false;
  return (
    /\bmi cita\b/.test(t) ||
    /\bmis citas\b/.test(t) ||
    /\btengo (una )?cita\b/.test(t) ||
    /\bcita agendada\b/.test(t) ||
    /\bcita asignada\b/.test(t) ||
    /\bconsultar( la)? cita\b/.test(t) ||
    /\bcu[aá]ndo es mi cita\b/.test(t) ||
    /\bver (mi|mis) cita\b/.test(t) ||
    /\brevisar (mi|mis) citas?\b/.test(t) ||
    /\bcita\s+(?:n[uú]mero\s+)?[#]?\s*\d{1,10}\b/.test(t) ||
    /\bl[aá] cita\s+(?:es la\s+)?(?:n[uú]mero\s+)?[#]?\s*\d{1,10}\b/.test(t) ||
    /\bqu[ée] hora (tengo|toca|es) (la |mi |una )?(cita|servicio|mantenimiento|revisi[oó]n|afinaci[oó]n)\b/.test(t) ||
    /\bcu[aá]ndo es (mi|la) (servicio|mantenimiento|revisi[oó]n|afinaci[oó]n)\b/.test(t) ||
    /\b(tengo|cu[aá]ndo tengo) (mi|la) (servicio|mantenimiento|revisi[oó]n|afinaci[oó]n)\b/.test(t)
  );
};

const esConsultaCitaAmbiguo = (texto) => {
  const t = (texto || '').toLowerCase().replace(/\bq\b/g, 'qué');
  if (/\bagendar|reservar|separar\b/.test(t)) return false;
  if (/\b(pagar|pago|depositar|entregar|cobrar|renovar)\b/.test(t)) return false;

  const mencionaDestino = /\b(nissan|agencia|taller|mec[aá]nico)\b/.test(t);
  const preguntaMomento = /\b(qu[ée]|que) d[ií]a\b/.test(t) || /\bcu[aá]ndo\b/.test(t) || /\bqu[ée] hora\b/.test(t) || /\ba qu[ée] hora\b/.test(t);
  const quiereIr = /\b(ir|voy|ir[eé]|vaya|me toca|me toque|tengo que ir|debo ir|asistir|visitar)\b/.test(t);

  return (
    (mencionaDestino && preguntaMomento && quiereIr) ||
    /\btengo que ir\b.*\b(nissan|agencia|taller|mec[aá]nico)\b/.test(t) ||
    /\bcu[aá]ndo me (toca|corresponde|va a tocar)\b/.test(t) ||
    /\b(a qu[ée]|a que) hora me (toca|corresponde)\b/.test(t) ||
    /\bme toca (ir|asistir|venir)\b.*\b(nissan|agencia|taller)\b/.test(t)
  );
};

const esRespuestaAfirmativa = (texto) => {
  const t = (texto || '').trim().toLowerCase();
  return /^(s[ií]+|sip|s[ií]m|correct(o|a)|exact(o|a)|as[ií] es|adelante|dale|claro|ok[a]?)/.test(t);
};

const formatearRespuestaCitasCliente = (citasCliente) => (
  citasCliente.length === 0
    ? [
        'No encontré citas agendadas a tu nombre con este número.',
        '¿Quieres agendar una cita? Con gusto te ayudo en este momento.',
      ].join('\n')
    : [
        formatearCitasCliente(citasCliente),
        '',
        '¿Quieres agendar otra cita o reprogramar alguna de estas? Solo dime.',
      ].join('\n')
);

const formatearRespuestaCitaUnica = (cita) => {
  const fechaTexto = cita.fechaHora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const horaTexto = cita.fechaHora.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  return [
    'Estos son los datos de tu cita (de nuestra base de datos):',
    `♻️ No. de cita: ${cita.id}`,
    `🔧 Servicio: ${cita.servicio}`,
    `📅 Fecha: ${fechaTexto}`,
    `⏰ Hora: ${horaTexto}`,
    cita.estado ? `📌 Estado: ${cita.estado}` : '',
    'Si necesitas agendar otra cita, solo dime.',
  ].filter(Boolean).join('\n');
};

const extraerNumeroCitaMencionado = (texto) => {
  const t = (texto || '').toLowerCase();
  const patrones = [
    /\b(n[uú]mero de (la )?cita)\s*[:#]?\s*(\d{1,10})\b/,
    /\b(l[aá]|mi|el)\s+cita\s+(?:es la\s+)?(?:n[uú]mero\s+)?[#]?\s*(\d{1,10})\b/,
    /\bcita\s+(?:n[uú]mero\s+)?[#]?\s*(\d{1,10})\b/,
  ];
  for (const re of patrones) {
    const match = t.match(re);
    if (match) return parseInt(match[match.length - 1], 10);
  }
  return null;
};

const estadoEsperaCita = new Map();
const EXPIRACION_ESPERA_CITA_MS = 10 * 60 * 1000;

const formatearPreguntaConfirmacionCita = () => [
  'Entiendo que quieres saber cuándo ir a Nissan. 🤔',
  '¿Te refieres a consultar tu cita agendada?',
  '',
  'Responde SÍ para ver tus citas, o dime exactamente qué necesitas (precios, agendar cita, otro tema).',
].join('\n');

const extraerDatosCita = async (textoCliente, historial) => {
  const conversacion = historial.length > 0
    ? historial.map((h) => `Cliente: ${h.mensajeUsuario}\nAsesor: ${h.respuestaBot}`).join('\n')
    : '- Ninguna.';

  const prompt = `
Eres un extractor de datos para citas de taller Nissan.
Con base en el mensaje actual del cliente y la conversación previa, determina si quiere CONSULTAR una cita ya agendada, si quiere AGENDAR una cita nueva, o ninguna de las dos, y extrae los datos que ya haya proporcionado.
Hoy es ${new Date().toDateString()}. Horario de la agencia: Lunes a Viernes 9:00-18:00, Sábados 9:00-14:00, Domingos cerrado.

Responde ÚNICAMENTE con un JSON válido (sin texto adicional, sin markdown) con este formato exacto:
{"agendar": true/false, "consultar": true/false, "completos": true/false, "servicio": "tipo de servicio o null", "fecha": "YYYY-MM-DD o null", "hora": "HH:MM en formato 24h o null", "faltantes": ["servicio"|"fecha"|"hora", ...]}

Reglas:
- consultar=true solo si el cliente quiere ver/revisar/saber sus citas YA agendadas con su número (ej. "cuándo es mi cita", "consulta mi cita", "tengo cita?", "ver mis citas", incluso si borró su chat y quiere retomarlas).
- agendar=true solo si el cliente está pidiendo agendar/programar/separar/confirmar una cita o taller NUEVO.
- completos=true solo si ya tiene servicio, fecha y hora (solo aplica cuando agendar=true).
- faltantes = los campos que aún no se han mencionado en toda la conversación (solo aplica cuando agendar=true).
- Si solo pregunta por horarios o disponibilidad (sin querer agendar aún), pon agendar=false y consultar=false.
- Convierte fechas relativas ("mañana", "el viernes", "15 de septiembre") a YYYY-MM-DD usando la fecha de hoy.
- Convierte horas ("3 de la tarde") a formato 24h (HH:MM).

Mensaje actual del cliente: "${textoCliente}"

Conversación previa:
${conversacion}
`;

  try {
    const respuesta = await generateContentConReintentos({
      model: geminiConfig.model,
      contents: prompt,
    });

    const texto = (respuesta.text || '').trim();
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const datos = JSON.parse(match[0]);
      return {
        agendar: !!datos.agendar,
        consultar: !!datos.consultar,
        completos: !!datos.completos,
        servicio: typeof datos.servicio === 'string' && datos.servicio.trim() ? datos.servicio.trim() : null,
        fecha: typeof datos.fecha === 'string' && datos.fecha.trim() ? datos.fecha.trim() : null,
        hora: typeof datos.hora === 'string' && datos.hora.trim() ? datos.hora.trim() : null,
        faltantes: Array.isArray(datos.faltantes) ? datos.faltantes : [],
      };
    } catch (error) {
      console.error("Error parseando datos de cita:", error.message);
      return null;
    }
  } catch (error) {
    console.error("Error extrayendo datos de cita:", error.message);
    return null;
  }
};

const validarHorarioAtencion = (fechaHora) => {
  const dia = fechaHora.getDay();
  const hora = fechaHora.getHours() + fechaHora.getMinutes() / 60;
  if (dia === 0) return false;
  if (dia === 6) return hora >= 9 && hora < 14;
  return hora >= 9 && hora < 18;
};

const formatearConfirmacionCita = (idCita, servicio, fechaHora) => {
  const fechaTexto = fechaHora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const horaTexto = fechaHora.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  return [
    `✅ ¡Cita agendada exitosamente!`,
    `♻️ Número de cita: ${idCita}`,
    `🔧 Servicio: ${servicio}`,
    `📅 Fecha: ${fechaTexto}`,
    `⏰ Hora: ${horaTexto}`,
    `Te esperamos en tu agencia Nissan más cercana.`,
  ].join('\n');
};

const procesarIntencionCitas = async ({ numeroCliente, textoCliente, historial }) => {
  const datosCita = await extraerDatosCita(textoCliente, historial);
  const consultaExplicita = esConsultaCitaExplicita(textoCliente);
  const consultaAmbiguo = esConsultaCitaAmbiguo(textoCliente);
  const quiereConsultar = consultaExplicita || (datosCita && datosCita.consultar && !consultaAmbiguo);

  if (quiereConsultar) {
    const citasCliente = await obtenerCitasPorNumeroCliente(numeroCliente);
    return formatearRespuestaCitasCliente(citasCliente);
  }

  if (consultaAmbiguo) {
    estadoEsperaCita.set(numeroCliente, { tipo: 'cita', ts: Date.now() });
    return formatearPreguntaConfirmacionCita();
  }

  if (!datosCita || !datosCita.agendar) {
    const citas = await obtenerCitas();
    const datosBD = formatearCitas(citas);
    return generarRespuestaGemini({ textoCliente, datosBD, historial, intencion: 'citas' });
  }

  const faltantes = datosCita.faltantes.filter((f) => ['servicio', 'fecha', 'hora'].includes(f));
  if (datosCita.completos && datosCita.servicio && datosCita.fecha && datosCita.hora) {
    const [anio, mes, dia] = datosCita.fecha.split('-').map(Number);
    const [hora, minuto] = datosCita.hora.split(':').map(Number);
    const fechaHora = new Date(anio, mes - 1, dia, hora, minuto, 0);

    if (isNaN(fechaHora.getTime())) {
      return 'No pude captar bien la fecha y hora. Por favor indícamelas así: "15 de septiembre a las 10:00 am".';
    }
    if (fechaHora.getTime() < Date.now()) {
      return 'Esa fecha u hora ya pasó. ¿Quieres agendar para otro día? Por favor indícame una fecha futura.';
    }
    if (!validarHorarioAtencion(fechaHora)) {
      return 'Ese horario no está dentro de nuestro horario de atención: lunes a viernes de 9:00 a 18:00 y sábados de 9:00 a 14:00. ¿Qué otro horario te conviene?';
    }
    if (await existeCitaEnHorario(fechaHora)) {
      return 'Lo siento, ese horario ya está ocupado. ¿Prefieres otro día u otra hora? Te esperamos de lunes a viernes de 9:00 a 18:00 y sábados de 9:00 a 14:00.';
    }

    const idCliente = await obtenerIdClientePorNumero(numeroCliente);
    if (!idCliente) {
      return 'Tuvimos un problema para identificarte. Intenta de nuevo en unos minutos.';
    }

    const idCita = await registrarCita({
      idCliente,
      servicio: datosCita.servicio,
      fechaHora,
    });
    return formatearConfirmacionCita(idCita, datosCita.servicio, fechaHora);
  }

  const textosFaltantes = {
    servicio: '¿Qué servicio necesitas? (ej. afinación, cambio de aceite, alineación o balanceo)',
    fecha: '¿Para qué día te gustaría agendar tu cita?',
    hora: '¿A qué hora te quedaría mejor?',
  };
  const preguntas = faltantes.length > 0
    ? faltantes.map((f) => textosFaltantes[f] || '').filter(Boolean)
    : ['¿Qué servicio necesitas?', '¿Para qué día te gustaría agendar?', '¿A qué hora te quedaría mejor?'];

  return [
    'Perfecto, te ayudo a agendar tu cita:',
    ...preguntas.map((p) => `- ${p}`),
    '',
    'Te recuerdo que atendemos de lunes a viernes de 9:00 a 18:00 y sábados de 9:00 a 14:00.',
  ].join('\n');
};

const generarRespuesta = async ({ numeroCliente, textoCliente }) => {
  const intencion = await identificarIntencion(textoCliente);

  const datosBD = await obtenerDatosPorIntencion(intencion);
  const historial = await obtenerHistorial(numeroCliente);
  const prompt = construirPromptRespuesta({ datosBD, historial, textoCliente, intencion });

  await registrarConsultaDB(`IA_RESPUESTA_${intencion}`, prompt);

  const geminiResponse = await generateContentConReintentos({
    model: geminiConfig.model,  
    contents: prompt,
  });

  const respuesta = geminiResponse.text || "Hola, ¿en qué te puedo ayudar hoy con tu Nissan?";
  return respuesta.length > LIMITE_CARACTERES_RESPUESTA
    ? respuesta.slice(0, LIMITE_CARACTERES_RESPUESTA)
    : respuesta;
};

const procesarPreguntaCliente = async ({ numeroCliente, textoCliente }) => {
  console.log(`Procesando pregunta del cliente: "${textoCliente}"`);

  const pendiente = estadoEsperaCita.get(numeroCliente);
  if (pendiente && pendiente.tipo === 'cita' && Date.now() - pendiente.ts < EXPIRACION_ESPERA_CITA_MS) {
    estadoEsperaCita.delete(numeroCliente);
    if (esRespuestaAfirmativa(textoCliente)) {
      const citasCliente = await obtenerCitasPorNumeroCliente(numeroCliente);
      await registrarConsultaDB('CITA_CONSULTA_CONFIRMADA', `Consulta de cita confirmada para ${numeroCliente}`);
      return formatearRespuestaCitasCliente(citasCliente);
    }
  } else {
    estadoEsperaCita.delete(numeroCliente);
  }

  if (esConsultaCitaExplicita(textoCliente)) {
    const numeroCita = extraerNumeroCitaMencionado(textoCliente);
    if (numeroCita) {
      const cita = await obtenerCitaPorId(numeroCita);
      const idCliente = await obtenerIdClientePorNumero(numeroCliente);
      await registrarConsultaDB('CITA_CONSULTA_ID', `Consulta de cita ${numeroCita} para ${numeroCliente}`);
      if (!cita || cita.idCliente !== idCliente) {
        return 'No encontré una cita con ese número asociada a tu teléfono. Revisa el número que te dimos al agendar.';
      }
      return formatearRespuestaCitaUnica(cita);
    }
    const citasCliente = await obtenerCitasPorNumeroCliente(numeroCliente);
    await registrarConsultaDB('CITA_CONSULTA_DIRECTA', `Consulta explícita de cita para ${numeroCliente}`);
    return formatearRespuestaCitasCliente(citasCliente);
  }

  const intencion = await identificarIntencion(textoCliente);
  console.log(`Intención detectada: ${intencion}`);

  if (intencion === 'citas' || esConsultaCitaAmbiguo(textoCliente)) {
    const historial = await obtenerHistorial(numeroCliente);
    const respuestaCita = await procesarIntencionCitas({ numeroCliente, textoCliente, historial });
    const promptResumen = construirPromptRespuesta({
      datosBD: formatearCitas(await obtenerCitas()),
      historial,
      textoCliente,
      intencion,
    });
    await registrarConsultaDB(`IA_RESPUESTA_${intencion}`, promptResumen);
    return respuestaCita;
  }

  let datosBD = "No aplica consulta estructurada: la IA responde con su conocimiento sobre la marca Nissan.";

  if (intencion === 'precios') {
    datosBD = formatearInventario(await obtenerInventario());
  }

  const historial = await obtenerHistorial(numeroCliente);
  return generarRespuestaGemini({ textoCliente, datosBD, historial, intencion });
};

module.exports = { generarRespuesta, procesarPreguntaCliente };