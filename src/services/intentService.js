const identificarIntencion = (texto) => {
    const t = texto.toLowerCase();
    if (t.includes('cita') || t.includes('servicio') || t.includes('mantenimiento') || t.includes('horario')) {
        return 'CITAS';
    }
    if (t.includes('refaccion') || t.includes('pieza') || t.includes('bateria') || t.includes('auto') || t.includes('precio') || t.includes('versa') || t.includes('sentra') || t.includes('kicks') || t.includes('march')) {
        return 'INVENTARIO';
    }
    return 'GENERAL';
};

module.exports = { identificarIntencion };