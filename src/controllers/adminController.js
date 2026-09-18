const express = require('express');
const crypto = require('crypto');
const { sql } = require('../config/database');

const router = express.Router();

const USUARIO_ADMIN = process.env.ADMIN_USER || 'admin';
const CONTRASENA_ADMIN = process.env.ADMIN_PASS || '22620047';
const EXPIRACION_TOKEN_MS = 12 * 60 * 60 * 1000;

const tokens = new Map();

function limpiarTokens() {
  for (const [token, datos] of tokens) {
    if (datos.expira < Date.now()) tokens.delete(token);
  }
}

function generarToken(usuario) {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, { usuario, expira: Date.now() + EXPIRACION_TOKEN_MS });
  return token;
}

function requiereAuth(req, res, next) {
  limpiarTokens();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.adminToken = token;
  req.adminUsuario = tokens.get(token).usuario;
  next();
}

async function consulta(querySql) {
  const pool = await sql.connect();
  const resultado = await pool.request().query(querySql);
  return resultado.recordset;
}

async function contar(consultaSql) {
  try {
    const filas = await consulta(consultaSql);
    if (filas.length > 0) {
      const valor = Object.values(filas[0])[0];
      return valor == null ? 0 : valor;
    }
    return 0;
  } catch (error) {
    console.error('Error en conteo:', error.message);
    return 0;
  }
}

async function consultaSegura(consultaSql, fallback = []) {
  try {
    return await consulta(consultaSql);
  } catch (error) {
    console.error('Error en consulta:', error.message);
    return fallback;
  }
}

router.get('/', (req, res) => res.redirect('/admin/dashboard.html'));
router.get('/login', (req, res) => res.redirect('/admin/login.html'));
router.get('/dashboard', (req, res) => res.redirect('/admin/dashboard.html'));

router.post('/api/login', (req, res) => {
  const { usuario, contrasena } = req.body || {};
  limpiarTokens();
  if (usuario === USUARIO_ADMIN && contrasena === CONTRASENA_ADMIN) {
    return res.json({ token: generarToken(usuario), usuario });
  }
  return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

router.post('/api/logout', requiereAuth, (req, res) => {
  tokens.delete(req.adminToken);
  res.json({ ok: true });
});

router.get('/api/stats', requiereAuth, async (req, res) => {
  try {
    const [
      totalClientes,
      totalMensajes,
      mensajesHoy,
      clientesHoy,
      citasHoy,
      totalCitas,
      citasPendientes,
      citasProximas,
      totalProductos,
      stockTotal,
      valorInventario,
      consultasIA,
      consultasHoy,
    ] = await Promise.all([
      contar('SELECT COUNT(*) AS n FROM Clientes'),
      contar('SELECT COUNT(*) AS n FROM Mensajes'),
      contar("SELECT COUNT(*) AS n FROM Mensajes WHERE CONVERT(date, Fecha) = CONVERT(date, GETDATE())"),
      contar("SELECT COUNT(*) AS n FROM Clientes WHERE CONVERT(date, FechaRegistro) = CONVERT(date, GETDATE())"),
      contar("SELECT COUNT(*) AS n FROM Citas WHERE CONVERT(date, FechaHora) = CONVERT(date, GETDATE()) AND Estado = 'Confirmada'"),
      contar("SELECT COUNT(*) AS n FROM Citas WHERE Estado = 'Confirmada'"),
      contar("SELECT COUNT(*) AS n FROM Citas WHERE Estado IS NULL OR LOWER(Estado) <> 'confirmada'"),
      contar("SELECT COUNT(*) AS n FROM Citas WHERE Estado = 'Confirmada' AND FechaHora >= GETDATE()"),
      contar('SELECT COUNT(*) AS n FROM Inventario'),
      contar('SELECT ISNULL(SUM(Stock), 0) AS n FROM Inventario'),
      contar('SELECT ISNULL(SUM(Precio * Stock), 0) AS n FROM Inventario'),
      contar('SELECT COUNT(*) AS n FROM HistorialConsultasDB'),
      contar("SELECT COUNT(*) AS n FROM HistorialConsultasDB WHERE CONVERT(date, FechaHora) = CONVERT(date, GETDATE())"),
    ]);

    const mensajesPorDia = await consultaSegura(`
      SELECT CONVERT(date, Fecha) AS fecha, COUNT(*) AS total
      FROM Mensajes
      WHERE Fecha >= DATEADD(day, -6, CONVERT(date, GETDATE()))
      GROUP BY CONVERT(date, Fecha)
      ORDER BY fecha ASC
    `);

    const mensajesPorHora = await consultaSegura(`
      SELECT DATEPART(hour, Fecha) AS hora, COUNT(*) AS total
      FROM Mensajes
      WHERE Fecha >= DATEADD(day, -6, GETDATE())
      GROUP BY DATEPART(hour, Fecha)
      ORDER BY hora ASC
    `);

    const citasPorServicio = await consultaSegura(`
      SELECT Servicio, COUNT(*) AS total
      FROM Citas
      WHERE Estado = 'Confirmada'
      GROUP BY Servicio
      ORDER BY total DESC
    `);

    const topClientes = await consultaSegura(`
      SELECT TOP 5 ISNULL(NULLIF(cl.Nombre, ''), 'Cliente') AS nombre,
             cl.NumeroTelefono, COUNT(m.Id) AS mensajes
      FROM Clientes cl
      JOIN Mensajes m ON m.IdCliente = cl.Id
      GROUP BY cl.Nombre, cl.NumeroTelefono
      ORDER BY mensajes DESC
    `);

    const proximasCitas = await consultaSegura(`
      SELECT TOP 8 ct.Id, ct.Servicio, ct.FechaHora, ct.Estado,
             cl.NumeroTelefono, ISNULL(cl.Nombre, 'Sin nombre') AS Nombre
      FROM Citas ct
      LEFT JOIN Clientes cl ON ct.IdCliente = cl.Id
      WHERE ct.Estado = 'Confirmada' AND ct.FechaHora >= GETDATE()
      ORDER BY ct.FechaHora ASC
    `);

    const ultimasActividades = await consultaSegura(`
      SELECT TOP 10 m.Id, m.TextoMensaje, m.Fecha,
             cl.NumeroTelefono, ISNULL(cl.Nombre, 'Sin nombre') AS Nombre
      FROM Mensajes m
      LEFT JOIN Clientes cl ON m.IdCliente = cl.Id
      ORDER BY m.Fecha DESC
    `);

    res.json({
      kpis: {
        totalClientes,
        totalMensajes,
        mensajesHoy,
        clientesHoy,
        citasHoy,
        totalCitas,
        citasPendientes,
        citasProximas,
        totalProductos,
        stockTotal,
        valorInventario,
        consultasIA,
        consultasHoy,
      },
      mensajesPorDia,
      mensajesPorHora,
      citasPorServicio,
      topClientes,
      proximasCitas,
      ultimasActividades,
    });
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

router.get('/api/clientes', requiereAuth, async (req, res) => {
  try {
    const filas = await consultaSegura(`
      SELECT c.Id, c.NumeroTelefono, ISNULL(c.Nombre, 'Sin nombre') AS Nombre, c.FechaRegistro,
             (SELECT COUNT(*) FROM Mensajes m WHERE m.IdCliente = c.Id) AS totalMensajes,
             (SELECT MAX(m.Fecha) FROM Mensajes m WHERE m.IdCliente = c.Id) AS ultimaActividad
      FROM Clientes c
      ORDER BY c.FechaRegistro DESC
    `);
    res.json(filas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/citas', requiereAuth, async (req, res) => {
  try {
    const filas = await consultaSegura(`
      SELECT ct.Id, ct.IdCliente, ct.Servicio, ct.FechaHora, ct.Estado,
             cl.NumeroTelefono, ISNULL(cl.Nombre, 'Sin nombre') AS Nombre
      FROM Citas ct
      LEFT JOIN Clientes cl ON ct.IdCliente = cl.Id
      ORDER BY ct.FechaHora DESC
    `);
    res.json(filas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/conversaciones', requiereAuth, async (req, res) => {
  try {
    const filas = await consultaSegura(`
      SELECT TOP 100 m.Id AS idMensaje, m.TextoMensaje, m.Fecha,
             cl.NumeroTelefono, ISNULL(cl.Nombre, 'Sin nombre') AS Nombre,
             rb.TextoRespuesta, rb.FechaRespuesta
      FROM Mensajes m
      LEFT JOIN Clientes cl ON m.IdCliente = cl.Id
      LEFT JOIN RespuestaBot rb ON m.Id = rb.IdMensaje
      ORDER BY m.Fecha DESC
    `);
    res.json(filas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/inventario', requiereAuth, async (req, res) => {
  try {
    const filas = await consultaSegura(`
      SELECT Categoria, NombreProducto, Descripcion,
             ISNULL(Precio, 0) AS Precio, ISNULL(Stock, 0) AS Stock
      FROM Inventario
      ORDER BY Categoria ASC, NombreProducto ASC
    `);
    res.json(filas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/historial', requiereAuth, async (req, res) => {
  try {
    const filas = await consultaSegura(`
      SELECT TOP 100 Id, TipoConsulta, QueryEjecutado, FechaHora
      FROM HistorialConsultasDB
      ORDER BY FechaHora DESC
    `);
    res.json(filas);
  } catch (error) {
    res.json([]);
  }
});

module.exports = { router, requiereAuth };