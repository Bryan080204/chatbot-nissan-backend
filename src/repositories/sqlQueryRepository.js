const { sql } = require('../config/database');
const Producto = require('../models/producto');
const Cita = require('../models/cita');

let historialNoDisponibleNotificado = false;

const registrarConsultaDB = async (tipo, query) => {
  try {
    const pool = await sql.connect();
    await pool.request()
      .input('tipo', sql.VarChar(50), tipo)
      .input('qry', sql.NVarChar, query)
      .query('INSERT INTO HistorialConsultasDB (TipoConsulta, QueryEjecutado) VALUES (@tipo, @qry)');
  } catch (error) {
    if (!historialNoDisponibleNotificado) {
      historialNoDisponibleNotificado = true;
      console.error("HistorialConsultasDB no disponible en la BD:", error.message);
    }
  }
};

const obtenerInventario = async () => {
  const query = 'SELECT Categoria, NombreProducto, Descripcion, Precio, Stock FROM Inventario';
  await registrarConsultaDB('INVENTARIO', query);
  const pool = await sql.connect();
  const result = await pool.request().query(query);
  return result.recordset.map((r) => new Producto(r));
};

const obtenerCitas = async () => {
  const query = "SELECT Id, IdCliente, Servicio, FechaHora, Estado FROM Citas WHERE Estado = 'Confirmada'";
  await registrarConsultaDB('CITAS', query);
  const pool = await sql.connect();
  const result = await pool.request().query(query);
  return result.recordset.map((r) => new Cita(r));
};

const obtenerIdClientePorNumero = async (numeroTelefono) => {
  const pool = await sql.connect();
  const result = await pool.request()
    .input('numero', sql.VarChar(15), numeroTelefono)
    .query('SELECT TOP 1 Id FROM Clientes WHERE NumeroTelefono = @numero');
  return result.recordset.length > 0 ? result.recordset[0].Id : null;
};

const existeCitaEnHorario = async (fechaHora) => {
  const pool = await sql.connect();
  const result = await pool.request()
    .input('fechaHora', sql.DateTime, fechaHora)
    .query("SELECT COUNT(*) AS Total FROM Citas WHERE Estado = 'Confirmada' AND FechaHora = @fechaHora");
  return result.recordset[0].Total > 0;
};

const registrarCita = async ({ idCliente, servicio, fechaHora }) => {
  const query = `INSERT INTO Citas (IdCliente, Servicio, FechaHora) VALUES (${idCliente}, '${servicio}', '${fechaHora.toISOString()}')`;
  await registrarConsultaDB('CITA_NUEVA', query);
  const pool = await sql.connect();
  const result = await pool.request()
    .input('idCliente', sql.Int, idCliente)
    .input('servicio', sql.NVarChar(100), servicio)
    .input('fechaHora', sql.DateTime, fechaHora)
    .query('INSERT INTO Citas (IdCliente, Servicio, FechaHora) VALUES (@idCliente, @servicio, @fechaHora); SELECT SCOPE_IDENTITY() AS Id;');
  return result.recordset[0].Id;
};

module.exports = {
  registrarConsultaDB,
  obtenerInventario,
  obtenerCitas,
  obtenerIdClientePorNumero,
  existeCitaEnHorario,
  registrarCita,
};