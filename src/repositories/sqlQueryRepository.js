const { sql, obtenerRequest } = require('../config/database');
const Producto = require('../models/producto');
const Cita = require('../models/cita');

let historialNoDisponibleNotificado = false;

/* ----- Historial de consultas en lote (evita saturar la BD) ----- */
let bufferConsultas = [];
const MAX_BUFFER_CONSULTAS = 300;
const INTERVALO_FLUSH_MS = 5000;
let timerFlush = null;

const registrarConsultaDB = async (tipo, query) => {
  if (bufferConsultas.length >= MAX_BUFFER_CONSULTAS) return;
  bufferConsultas.push({ tipo: String(tipo).slice(0, 50), query: String(query || '').slice(0, 4000) });
  if (!timerFlush) timerFlush = setTimeout(flushConsultasDB, INTERVALO_FLUSH_MS);
};

const flushConsultasDB = async () => {
  timerFlush = null;
  if (bufferConsultas.length === 0) return;

  const filas = bufferConsultas;
  bufferConsultas = [];

  try {
    const req = await obtenerRequest();
    const valores = filas.map((_, i) => {
      req.input(`tipo${i}`, sql.VarChar(50), filas[i].tipo);
      req.input(`qry${i}`, sql.NVarChar(sql.MAX), filas[i].query);
      return `(@tipo${i}, @qry${i})`;
    });
    await req.query(`INSERT INTO HistorialConsultasDB (TipoConsulta, QueryEjecutado) VALUES ${valores.join(', ')}`);
  } catch (error) {
    bufferConsultas = filas.concat(bufferConsultas).slice(0, MAX_BUFFER_CONSULTAS);
    if (!historialNoDisponibleNotificado) {
      historialNoDisponibleNotificado = true;
      console.error("HistorialConsultasDB no disponible en la BD:", error.message);
    }
  }
};

/* ----- Caché de inventario (TLL 30s: los precios no pegan a la BD a cada rato) ----- */
const TTL_INVENTARIO_MS = 30000;
let cacheInventario = null;
let cacheInventarioTs = 0;
let promesaInventario = null;

const obtenerInventario = async (usarCache = true) => {
  if (usarCache && cacheInventario && Date.now() - cacheInventarioTs < TTL_INVENTARIO_MS) {
    return cacheInventario;
  }

  if (promesaInventario) return promesaInventario;

  promesaInventario = (async () => {
    const request = await obtenerRequest();
    registrarConsultaDB('INVENTARIO', 'SELECT Categoria, NombreProducto, Descripcion, Precio, Stock FROM Inventario');
    const result = await request.query('SELECT TOP 100 Categoria, NombreProducto, Descripcion, Precio, Stock FROM Inventario');
    const productos = result.recordset.map((r) => new Producto(r));
    cacheInventario = productos;
    cacheInventarioTs = Date.now();
    return productos;
  })();

  try {
    return await promesaInventario;
  } finally {
    promesaInventario = null;
  }
};

const obtenerCitas = async () => {
  registrarConsultaDB('CITAS', "SELECT TOP 30 Id, IdCliente, Servicio, FechaHora, Estado FROM Citas WHERE Estado = 'Confirmada'");
  const request = await obtenerRequest();
  const result = await request.query(`
    SELECT TOP 30 Id, IdCliente, Servicio, FechaHora, Estado
    FROM Citas
    WHERE Estado = 'Confirmada'
    ORDER BY FechaHora ASC
  `);
  return result.recordset.map((r) => new Cita(r));
};

const obtenerCitasPorNumeroCliente = async (numeroTelefono) => {
  const request = await obtenerRequest();
  const result = await request.input('numero', sql.VarChar(15), numeroTelefono)
    .query(`
      SELECT c.Id, c.IdCliente, c.Servicio, c.FechaHora, c.Estado
      FROM Citas c
      JOIN Clientes cl ON c.IdCliente = cl.Id
      WHERE cl.NumeroTelefono = @numero AND c.Estado = 'Confirmada'
      ORDER BY c.FechaHora ASC
    `);
  return result.recordset.map((r) => new Cita(r));
};

const obtenerCitaPorId = async (idCita) => {
  const request = await obtenerRequest();
  const result = await request.input('idCita', sql.Int, idCita)
    .query('SELECT TOP 1 Id, IdCliente, Servicio, FechaHora, Estado FROM Citas WHERE Id = @idCita');
  return result.recordset.length > 0 ? new Cita(result.recordset[0]) : null;
};

const obtenerIdClientePorNumero = async (numeroTelefono) => {
  const request = await obtenerRequest();
  const result = await request.input('numero', sql.VarChar(15), numeroTelefono)
    .query('SELECT TOP 1 Id FROM Clientes WHERE NumeroTelefono = @numero');
  return result.recordset.length > 0 ? result.recordset[0].Id : null;
};

const existeCitaEnHorario = async (fechaHora) => {
  const request = await obtenerRequest();
  const result = await request.input('fechaHora', sql.DateTime, fechaHora)
    .query("SELECT COUNT(*) AS Total FROM Citas WHERE Estado = 'Confirmada' AND FechaHora = @fechaHora");
  return result.recordset[0].Total > 0;
};

const registrarCita = async ({ idCliente, servicio, fechaHora }) => {
  const request = await obtenerRequest();
  const result = await request.input('idCliente', sql.Int, idCliente)
    .input('servicio', sql.NVarChar(100), servicio)
    .input('fechaHora', sql.DateTime, fechaHora)
    .query('INSERT INTO Citas (IdCliente, Servicio, FechaHora) VALUES (@idCliente, @servicio, @fechaHora); SELECT SCOPE_IDENTITY() AS Id;');
  return result.recordset[0].Id;
};

module.exports = {
  registrarConsultaDB,
  flushConsultasDB,
  obtenerInventario,
  obtenerCitas,
  obtenerCitasPorNumeroCliente,
  obtenerCitaPorId,
  obtenerIdClientePorNumero,
  existeCitaEnHorario,
  registrarCita,
};