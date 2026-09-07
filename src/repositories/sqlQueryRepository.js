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
  const query = "SELECT FechaHora, Servicio FROM Citas WHERE Estado = 'Confirmada'";
  await registrarConsultaDB('CITAS', query);
  const pool = await sql.connect();
  const result = await pool.request().query(query);
  return result.recordset.map((r) => new Cita(r));
};

module.exports = { registrarConsultaDB, obtenerInventario, obtenerCitas };