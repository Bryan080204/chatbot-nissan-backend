const { sql } = require('../config/database');
const Mensaje = require('../models/mensaje');

const LIMITE_MENSAJE = 500;

const registrarMensaje = async (numeroTelefono, mensajeUsuario, respuestaBot) => {
  const pool = await sql.connect();
  await pool.request()
    .input('numero', sql.VarChar(15), numeroTelefono)
    .input('usr', sql.NVarChar(LIMITE_MENSAJE), mensajeUsuario)
    .input('bot', sql.NVarChar(LIMITE_MENSAJE), respuestaBot)
    .query('INSERT INTO Mensajes (NumeroTelefono, MensajeUsuario, RespuestaBot) VALUES (@numero, @usr, @bot)');
};

const obtenerHistorial = async (numeroTelefono, limite = 3) => {
  const pool = await sql.connect();
  const result = await pool.request()
    .input('numero', sql.VarChar(15), numeroTelefono)
    .input('limite', sql.Int, limite)
    .query('SELECT TOP (@limite) Id, NumeroTelefono, MensajeUsuario, RespuestaBot, Fecha FROM Mensajes WHERE NumeroTelefono = @numero ORDER BY Id DESC');
  return result.recordset.reverse().map((r) => new Mensaje(r));
};

module.exports = { registrarMensaje, obtenerHistorial };