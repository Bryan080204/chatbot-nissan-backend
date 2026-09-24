const { sql, obtenerRequest } = require('../config/database');
const Mensaje = require('../models/mensaje');
const { registrarClienteSiNuevo } = require('./userRepository');

const LIMITE_MENSAJE = 500;

const registrarMensaje = async (numeroTelefono, mensajeUsuario, jsonWebhookString) => {
  await registrarClienteSiNuevo(numeroTelefono);

  const request = await obtenerRequest();
  const clienteRes = await request.input('numero', sql.VarChar(15), numeroTelefono)
    .query('SELECT Id FROM Clientes WHERE NumeroTelefono = @numero');

  if (clienteRes.recordset.length === 0) {
    throw new Error(`Cliente con número ${numeroTelefono} no encontrado.`);
  }

  const idCliente = clienteRes.recordset[0].Id;

  const textoTruncado = String(mensajeUsuario || '').slice(0, LIMITE_MENSAJE);

  const resultado = await request
    .input('idCliente', sql.Int, idCliente)
    .input('usr', sql.NVarChar(LIMITE_MENSAJE), textoTruncado)
    .query('INSERT INTO Mensajes (IdCliente, TextoMensaje) VALUES (@idCliente, @usr); SELECT SCOPE_IDENTITY() AS Id;');
  
  return resultado.recordset[0].Id;
};

const registrarRespuestaBot = async (idMensaje, textoRespuesta) => {
  const request = await obtenerRequest();
  await request.input('idMensaje', sql.Int, idMensaje)
    .input('respuesta', sql.NVarChar(sql.MAX), textoRespuesta)
    .query('INSERT INTO RespuestaBot (IdMensaje, TextoRespuesta, FechaRespuesta) VALUES (@idMensaje, @respuesta, GETDATE())');
};

const obtenerHistorial = async (numeroTelefono, limite = 5) => {
  try {
    const request = await obtenerRequest();
    const result = await request.input('numero', sql.VarChar(15), numeroTelefono)
      .input('limite', sql.Int, limite)
      .query(`
        SELECT TOP (@limite) 
          m.TextoMensaje AS mensajeUsuario, 
          rb.TextoRespuesta AS respuestaBot 
        FROM Mensajes m
        LEFT JOIN RespuestaBot rb ON m.Id = rb.IdMensaje
        JOIN Clientes c ON m.IdCliente = c.Id
        WHERE c.NumeroTelefono = @numero
        ORDER BY m.Fecha DESC
      `);
    
    return result.recordset.reverse();
  } catch (error) {
    console.error("Error al obtener historial:", error.message);
    return [];
  }
};

module.exports = { registrarMensaje, registrarRespuestaBot, obtenerHistorial };