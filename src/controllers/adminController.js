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
      totalRespuestas,
      respuestasHoy,
      clientesActivosHoy,
      mensajesSinRespuesta,
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
      contar('SELECT COUNT(*) AS n FROM RespuestaBot'),
      contar("SELECT COUNT(*) AS n FROM RespuestaBot WHERE CONVERT(date, FechaRespuesta) = CONVERT(date, GETDATE())"),
      contar("SELECT COUNT(DISTINCT IdCliente) AS n FROM Mensajes WHERE CONVERT(date, Fecha) = CONVERT(date, GETDATE())"),
      contar(`SELECT COUNT(*) AS n FROM Mensajes m LEFT JOIN RespuestaBot rb ON m.Id = rb.IdMensaje WHERE rb.Id IS NULL`),
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

    const citasPorDia = await consultaSegura(`
      SELECT CONVERT(date, FechaHora) AS fecha, COUNT(*) AS total
      FROM Citas
      WHERE Estado = 'Confirmada'
        AND FechaHora >= CONVERT(date, GETDATE())
        AND FechaHora < DATEADD(day, 7, CONVERT(date, GETDATE()))
      GROUP BY CONVERT(date, FechaHora)
      ORDER BY fecha ASC
    `);

    const clientesPorDia = await consultaSegura(`
      SELECT CONVERT(date, FechaRegistro) AS fecha, COUNT(*) AS total
      FROM Clientes
      WHERE FechaRegistro >= DATEADD(day, -6, CONVERT(date, GETDATE()))
      GROUP BY CONVERT(date, FechaRegistro)
      ORDER BY fecha ASC
    `);

    const citasPorEstado = await consultaSegura(`
      SELECT ISNULL(NULLIF(Estado, ''), 'Pendiente') AS estado, COUNT(*) AS total
      FROM Citas
      GROUP BY Estado
      ORDER BY total DESC
    `);

    const inventarioPorCategoria = await consultaSegura(`
      SELECT Categoria, COUNT(*) AS productos, ISNULL(SUM(Stock), 0) AS unidades
      FROM Inventario
      GROUP BY Categoria
      ORDER BY unidades DESC
    `);

    const clientesPorHora = await consultaSegura(`
      SELECT DATEPART(hour, m.Fecha) AS hora, COUNT(DISTINCT m.IdCliente) AS total
      FROM Mensajes m
      WHERE m.Fecha >= DATEADD(day, -6, GETDATE())
      GROUP BY DATEPART(hour, m.Fecha)
      ORDER BY hora ASC
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
      SELECT TOP 8 m.Id, m.TextoMensaje, m.Fecha,
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
        totalRespuestas,
        respuestasHoy,
        clientesActivosHoy,
        mensajesSinRespuesta,
      },
      mensajesPorDia,
      mensajesPorHora,
      citasPorServicio,
      citasPorDia,
      clientesPorDia,
      citasPorEstado,
      inventarioPorCategoria,
      clientesPorHora,
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

router.get('/api/historial-grupos', requiereAuth, async (req, res) => {
  try {
    const filas = await consultaSegura(`
      SELECT gr.IdCliente,
             gr.NumeroTelefono,
             ISNULL(NULLIF(gr.Nombre, ''), 'Cliente') AS Nombre,
             gr.TotalMensajes,
             gr.UltimaFecha,
             (SELECT TOP 1 m2.TextoMensaje
              FROM Mensajes m2
              LEFT JOIN Clientes c2 ON m2.IdCliente = c2.Id
              WHERE c2.NumeroTelefono = gr.NumeroTelefono
              ORDER BY m2.Fecha DESC) AS UltimoMensaje
      FROM (
        SELECT c.NumeroTelefono,
               (SELECT TOP 1 c1.Id
                FROM Clientes c1
                INNER JOIN Mensajes m1 ON m1.IdCliente = c1.Id
                WHERE c1.NumeroTelefono = c.NumeroTelefono
                ORDER BY m1.Fecha DESC, c1.Id DESC) AS IdCliente,
               (SELECT TOP 1 c4.Nombre
                FROM Clientes c4
                INNER JOIN Mensajes m4 ON m4.IdCliente = c4.Id
                WHERE c4.NumeroTelefono = c.NumeroTelefono
                ORDER BY m4.Fecha DESC, c4.Id DESC) AS Nombre,
               COUNT(m.Id) AS TotalMensajes,
               MAX(m.Fecha) AS UltimaFecha
        FROM Clientes c
        INNER JOIN Mensajes m ON m.IdCliente = c.Id
        WHERE c.NumeroTelefono IS NOT NULL AND c.NumeroTelefono <> ''
        GROUP BY c.NumeroTelefono
      ) gr
      ORDER BY gr.UltimaFecha DESC
    `);
    res.json(filas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/historial-mensajes', requiereAuth, async (req, res) => {
  const { idCliente, numero } = req.query;
  const porId = idCliente && !numero;
  if (!porId && !numero) return res.status(400).json({ error: 'Se requiere idCliente o numero' });
  try {
    const pool = await sql.connect();
    const request = pool.request();
    let where;
    if (porId) {
      request.input('id', sql.Int, idCliente);
      where = 'WHERE m.IdCliente = @id';
    } else {
      request.input('numero', sql.NVarChar, String(numero).trim());
      where = 'WHERE ISNULL(cl.NumeroTelefono, \'\') = @numero';
    }
    const resultado = await request.query(`
      SELECT m.Id AS IdMensaje, m.TextoMensaje, m.Fecha,
             rb.TextoRespuesta, rb.FechaRespuesta,
             ISNULL(NULLIF(cl.Nombre, ''), 'Cliente') AS Nombre,
             cl.NumeroTelefono
      FROM Mensajes m
      LEFT JOIN RespuestaBot rb ON m.Id = rb.IdMensaje
      LEFT JOIN Clientes cl ON m.IdCliente = cl.Id
      ${where}
      ORDER BY m.Fecha ASC
    `);
    res.json(resultado.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/historial-actividades', requiereAuth, async (req, res) => {
  try {
    const filas = await consultaSegura(`
      SELECT TOP 300 Id, Tipo, Detalle, FechaHora, Nombre, NumeroTelefono, Extra
      FROM (
        SELECT m.Id AS Id,
               'Mensaje' AS Tipo,
               m.TextoMensaje AS Detalle,
               m.Fecha AS FechaHora,
               ISNULL(NULLIF(cl.Nombre, ''), 'Cliente') AS Nombre,
               cl.NumeroTelefono AS NumeroTelefono,
               NULL AS Extra
        FROM Mensajes m
        LEFT JOIN Clientes cl ON m.IdCliente = cl.Id
        UNION ALL
        SELECT rb.Id,
               'Respuesta',
               rb.TextoRespuesta,
               rb.FechaRespuesta,
               ISNULL(NULLIF(cl.Nombre, ''), 'Cliente'),
               cl.NumeroTelefono,
               CONCAT('Estado: ', ISNULL(rb.EstadoEnvio, 'Pendiente'))
        FROM RespuestaBot rb
        LEFT JOIN Mensajes m ON rb.IdMensaje = m.Id
        LEFT JOIN Clientes cl ON m.IdCliente = cl.Id
        UNION ALL
        SELECT h.Id,
               CASE WHEN h.TipoConsulta LIKE '%ia%' OR h.TipoConsulta LIKE '%IA%' THEN 'Consulta IA' ELSE 'Consulta BD' END,
               h.QueryEjecutado,
               h.FechaHora,
               NULL,
               NULL,
               h.TipoConsulta
        FROM HistorialConsultasDB h
        UNION ALL
        SELECT ct.Id,
               'Cita',
               CONCAT(ISNULL(ct.Servicio, 'Servicio'), ' — ', ISNULL(ct.Estado, 'Pendiente')),
               ct.FechaHora,
               ISNULL(NULLIF(cl.Nombre, ''), 'Cliente'),
               cl.NumeroTelefono,
               CONCAT('Cita #', ct.Id)
        FROM Citas ct
        LEFT JOIN Clientes cl ON ct.IdCliente = cl.Id
      ) t
      ORDER BY FechaHora DESC
    `);
    res.json(filas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, requiereAuth };