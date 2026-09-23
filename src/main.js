import './style.css';
import Chart from 'chart.js/auto';

'use strict';

const TOKEN_KEY = 'admin_token';
const USUARIO_KEY = 'admin_usuario';

const $ = (sel) => document.querySelector(sel);

let charts = {};

/* ---------- Autenticación ---------- */
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
}
function setToken(token, recordar) {
  if (recordar) localStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function cerrarSesion() {
  const token = getToken();
  if (token) {
    fetch('/admin/api/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(() => {});
  }
  clearToken();
  localStorage.removeItem(USUARIO_KEY);
  renderLogin();
}

async function api(url, opciones = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(opciones.headers || {}),
    },
  });
  if (res.status === 401) {
    cerrarSesion();
    throw new Error('Sesión expirada');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

/* ---------- Utilidades ---------- */
const fmtNum = (n) => new Intl.NumberFormat('es-MX').format(n || 0);
const fmtMoneda = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
const fmtFechaHora = (v) => v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtFecha = (v) => v ? new Date(v).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtHora = (v) => v ? new Date(v).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
const iniciales = (nombre) => ((nombre || '?').trim()[0] || '?').toUpperCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PALETA = ['#c3002f', '#1e3a8a', '#ea580c', '#16a34a', '#7c3aed', '#0891b2', '#d97706', '#dc2626', '#4f46e5', '#0d9488'];

function primerMayus(s) {
  return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
}

const fmtFechaChat = (v) => {
  const d = new Date(v);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  if (d.getFullYear() === hoy.getFullYear()) return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtHoraChat = (v) => v ? new Date(v).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';

function estadoCita(estado) {
  const e = (estado || '').toLowerCase();
  if (e.includes('confirm')) return '<span class="badge-estado badge-confirmed">Confirmada</span>';
  if (e.includes('cancel')) return '<span class="badge-estado badge-cancelada">Cancelada</span>';
  if (e.includes('pend')) return '<span class="badge-estado badge-pendiente">Pendiente</span>';
  return '<span class="badge-estado badge-neutro">' + esc(estado || '—') + '</span>';
}

function badgeStock(stock) {
  if (stock <= 0) return '<span class="badge-estado badge-stock-0">Agotado</span>';
  if (stock <= 5) return '<span class="badge-estado badge-stock-bajo">Bajo ' + stock + '</span>';
  return '<span class="badge-estado badge-stock-ok">Disponible</span>';
}

function kpiCard({ icono, label, valor, sub, color, fondo, valorFuente = '' }) {
  return `
    <div class="kpi-card" style="--color-icona:${color};--fondo-icona:${fondo};--acierto:${color};">
      <div class="kpi-icona"><i class="fas ${icono}"></i></div>
      <div class="kpi-info">
        <div class="kpi-valor">${valor}<small>${valorFuente}</small></div>
        <div class="kpi-label">${label}</div>
        ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
      </div>
    </div>`;
}

function vacioHtml(msg) {
  return `<div class="vacio">${vacioIcono()}<p>${esc(msg)}</p></div>`;
}
function vacioIcono() {
  return '<i class="fas fa-inbox"></i>';
}

/* ---------- Vista: Login ---------- */
function renderLogin() {
  const app = $('#app');
  const tpl = $('#tpl-login');
  app.innerHTML = '';
  app.appendChild(tpl.content.cloneNode(true));

  document.body.className = 'login-body';

  const form = $('#formLogin');
  const btnLogin = $('#btnLogin');
  const mensaje = $('#mensaje');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const correo = $('#correo').value.trim();
    const password = $('#password').value.trim();
    const recordarme = $('#recordarme').checked;

    if (correo === '' || password === '') {
      mensaje.textContent = 'Por favor completa todos los campos.';
      mensaje.style.color = 'red';
      return;
    }
    if (password.length < 6) {
      mensaje.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      mensaje.style.color = 'orange';
      return;
    }

    mensaje.textContent = 'Verificando...';
    mensaje.style.color = 'white';
    btnLogin.disabled = true;
    btnLogin.querySelector('.spinner').hidden = false;

    try {
      const res = await fetch('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: correo, contrasena: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credenciales incorrectas');

      setToken(data.token, recordarme);
      localStorage.setItem(USUARIO_KEY, data.usuario);

      mensaje.textContent = '¡Inicio de sesión correcto!';
      mensaje.style.color = 'lightgreen';
      btnLogin.querySelector('.spinner').hidden = true;
      setTimeout(renderDashboard, 450);
    } catch (err) {
      mensaje.textContent = err.message || 'Error de conexión con el servidor';
      mensaje.style.color = 'red';
      btnLogin.disabled = false;
      btnLogin.querySelector('.spinner').hidden = true;
    }
  });
}

/* ---------- Vista: Dashboard ---------- */
const TITULOS = {
  resumen: ['Resumen general', 'Actividad del chatbot WhatsApp en tiempo real'],
  clientes: ['Clientes', 'Todos los clientes registrados por el chatbot'],
  citas: ['Citas', 'Agendamientos de taller registrados'],
  conversaciones: ['Conversaciones', 'Chats de cada cliente con el bot'],
  inventario: ['Inventario', 'Catálogo de productos y stock'],
  historial: ['Historial por cliente', 'Toda la actividad de cada chat: mensajes, respuestas, consultas IA/BD y citas'],
};

let wasapConversaciones = null;
let wasapHistorial = null;
let gruposHist = {};

function seccionActual() {
  const activo = document.querySelector('.nav-item.activo');
  return activo ? activo.dataset.seccion : 'resumen';
}

function setupCharts() {
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: { beginAtZero: true, ticks: { color: '#64748b', font: { size: 11 }, precision: 0 }, grid: { color: '#f1f5f9' } },
    },
  };

  charts.dias = new Chart($('#chartDias'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Mensajes', data: [], borderColor: '#c3002f', backgroundColor: 'rgba(195,0,47,.12)', fill: true, tension: .4, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#c3002f' }] },
    options: opts,
  });

  charts.horas = new Chart($('#chartHoras'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Mensajes', data: [], backgroundColor: '#1e3a8a', borderRadius: 6, maxBarThickness: 26 }] },
    options: opts,
  });

  charts.servicios = new Chart($('#chartServicios'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: PALETA, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#0f172a', font: { size: 11.5 }, padding: 12, boxWidth: 10 } },
      },
    },
  });
}

async function cargarSeccion(sec) {
  if (sec === 'resumen') return cargarResumen();
  if (sec === 'clientes') return cargarClientes();
  if (sec === 'citas') return cargarCitas();
  if (sec === 'conversaciones') return cargarConversaciones();
  if (sec === 'inventario') return cargarInventario();
  if (sec === 'historial') return cargarHistorial();
}

/* ================= RESUMEN ================= */
async function cargarResumen() {
  const btn = $('#btnRefrescar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
  try {
    const datos = await api('/admin/api/stats');
    pintarKPIs(datos.kpis);
    pintarGraficas(datos);
    pintarActividad(datos.ultimasActividades, datos.proximasCitas, datos.topClientes);
  } catch (e) {
    $('#actividadReciente').innerHTML = vacioHtml(e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rotate"></i> Actualizar';
  }
}

function pintarKPIs(k) {
  $('#kpisGeneral').innerHTML = [
    kpiCard({ icono: 'fa-users', label: 'Clientes', valor: fmtNum(k.totalClientes), sub: '+' + fmtNum(k.clientesHoy) + ' hoy', color: '#1e3a8a', fondo: '#eff6ff' }),
    kpiCard({ icono: 'fa-comment-dots', label: 'Mensajes recibidos', valor: fmtNum(k.totalMensajes), sub: '+' + fmtNum(k.mensajesHoy) + ' hoy', color: '#c3002f', fondo: '#fff1f4' }),
    kpiCard({ icono: 'fa-calendar-check', label: 'Citas confirmadas', valor: fmtNum(k.totalCitas), sub: fmtNum(k.citasPendientes) + ' pendientes', color: '#16a34a', fondo: '#f0fdf4' }),
    kpiCard({ icono: 'fa-clock', label: 'Citas próximas', valor: fmtNum(k.citasProximas), sub: fmtNum(k.citasHoy) + ' para hoy', color: '#7c3aed', fondo: '#f5f3ff' }),
    kpiCard({ icono: 'fa-boxes-stacked', label: 'Productos', valor: fmtNum(k.totalProductos), sub: fmtNum(k.stockTotal) + ' unidades', color: '#ea580c', fondo: '#fff7ed' }),
    kpiCard({ icono: 'fa-money-bill-trend-up', label: 'Valor inventario', valor: fmtMoneda(k.valorInventario).replace(',', ' '), color: '#0891b2', fondo: '#ecfeff' }),
    kpiCard({ icono: 'fa-robot', label: 'Consultas a la IA', valor: fmtNum(k.consultasIA), sub: '+' + fmtNum(k.consultasHoy) + ' hoy', color: '#d97706', fondo: '#fffbeb' }),
  ].join('');
}

function pintarGraficas(datos) {
  if (!charts.dias) setupCharts();

  const dias7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  });
  const mapaDias = {};
  (datos.mensajesPorDia || []).forEach((r) => {
    mapaDias[new Date(r.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })] = r.total;
  });
  charts.dias.data.labels = dias7;
  charts.dias.data.datasets[0].data = dias7.map((d) => mapaDias[d] || 0);
  charts.dias.update();

  const mapaHoras = {};
  (datos.mensajesPorHora || []).forEach((r) => (mapaHoras[r.hora] = r.total));
  const horas = Array.from({ length: 24 }, (_, i) => i);
  charts.horas.data.labels = horas.map((h) => h + ':00');
  charts.horas.data.datasets[0].data = horas.map((h) => mapaHoras[h] || 0);
  charts.horas.update();

  charts.servicios.data.labels = (datos.citasPorServicio || []).map((r) => r.Servicio);
  charts.servicios.data.datasets[0].data = (datos.citasPorServicio || []).map((r) => r.total);
  charts.servicios.update();
}

function pintarActividad(actividad, citas, top) {
  const elAct = $('#actividadReciente');
  if (!actividad || !actividad.length) {
    elAct.innerHTML = vacioHtml('No hay actividad todavía. Cuando un cliente escriba por WhatsApp, lo verás aquí.');
  } else {
    elAct.innerHTML = actividad.slice(0, 8).map((m) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <div class="mini-avatar" style="width:32px;height:32px;border-radius:50%;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${iniciales(m.Nombre)}</div>
        <div style="flex:1;min-width:0;">
          <b style="display:block;font-size:13px;">${esc(m.Nombre)}</b>
          <span style="font-size:12px;color:#64748b;">${esc(m.NumeroTelefono)}</span>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(m.TextoMensaje)}">${esc(m.TextoMensaje)}</div>
          <small style="color:#94a3b8;font-size:11px;">${fmtFechaHora(m.Fecha)}</small>
        </div>
      </div>`).join('');
  }

  const elCitas = $('#proximasCitas');
  if (!citas || !citas.length) {
    elCitas.innerHTML = vacioHtml('No hay citas próximas agendadas.');
  } else {
    elCitas.innerHTML = citas.map((c) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <div style="width:40px;height:40px;border-radius:10px;background:#fef2f2;color:#c3002f;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;">${new Date(c.FechaHora).getDate()}</div>
        <div style="flex:1;min-width:0;">
          <b style="display:block;font-size:13px;">${esc(c.Servicio)}</b>
          <span style="font-size:12px;color:#64748b;">${esc(c.Nombre)} · ${esc(c.NumeroTelefono)}</span>
        </div>
        <div style="text-align:right;font-size:12.5px;font-weight:600;color:#16a34a;">${fmtHora(c.FechaHora)} ${fmtFecha(c.FechaHora)}</div>
      </div>`).join('');
  }

  const elTop = $('#topClientes');
  if (!top || !top.length) {
    elTop.innerHTML = vacioHtml('Sin datos suficientes aún.');
  } else {
    const max = Math.max(...top.map((t) => t.mensajes), 1);
    elTop.innerHTML = top.map((t, i) => `
      <div class="lead-item">
        <span style="width:22px;text-align:center;font-weight:700;color:${i === 0 ? '#c3002f' : '#94a3b8'};">#${i + 1}</span>
        <div class="lead-info">
          <b>${esc(t.nombre)}</b>
          <span>${esc(t.NumeroTelefono)}</span>
          <div class="barra" style="margin-top:6px;"><div style="width:${(t.mensajes / max) * 100}%;background:${i === 0 ? '#c3002f' : '#1e3a8a'};"></div></div>
        </div>
        <div class="lead-valor">${fmtNum(t.mensajes)}</div>
      </div>`).join('');
  }
}

const AVATAR_GRADIENTES = [
  'linear-gradient(135deg,#c3002f,#ff7a9c)',
  'linear-gradient(135deg,#1e3a8a,#60a5fa)',
  'linear-gradient(135deg,#ea580c,#fdba74)',
  'linear-gradient(135deg,#16a34a,#86efac)',
  'linear-gradient(135deg,#7c3aed,#c4b5fd)',
  'linear-gradient(135deg,#0891b2,#67e8f9)',
  'linear-gradient(135deg,#d97706,#fde047)',
  'linear-gradient(135deg,#db2777,#f9a8d4)',
  'linear-gradient(135deg,#4f46e5,#a5b4fc)',
  'linear-gradient(135deg,#0d9488,#5eead4)',
];

function avatarGradiente(numero) {
  let n = 0;
  for (const ch of String(numero || '')) n = (n + ch.charCodeAt(0)) % 997;
  return AVATAR_GRADIENTES[n % AVATAR_GRADIENTES.length];
}

function tiempoRelativo(v) {
  if (!v) return '—';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  const min = Math.floor(s / 60);
  if (min < 60) return 'hace ' + min + ' min';
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return 'hace ' + hrs + ' h';
  const dias = Math.floor(hrs / 24);
  if (dias < 7) return 'hace ' + dias + ' d';
  return fmtFecha(v);
}

function escNumero(n) {
  return String(n || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ================= CLIENTES ================= */
let clientesTodos = [];
let filtroClientes = 'todos';

function irAChat(numero) {
  const nav = document.querySelector('.nav-item[data-seccion="conversaciones"]');
  if (nav) nav.click();
  setTimeout(() => {
    if (wasapConversaciones) wasapConversaciones.abrir(numero);
  }, 400);
}

function vincularFiltrosClientes() {
  const inp = $('#buscarCliente');
  if (!inp || inp.dataset.vinc) return;
  inp.dataset.vinc = '1';
  inp.addEventListener('input', pintarClientes);
  $('#limpiarBusqueda').addEventListener('click', () => {
    inp.value = '';
    pintarClientes();
    inp.focus();
  });
  $('#filtroClientes').addEventListener('change', (e) => {
    filtroClientes = e.target.value;
    pintarClientes();
  });
}

function pintarClientes() {
  const cuerpo = $('#tablaClientes tbody');
  if (!cuerpo) return;
  const btnLimpiar = $('#limpiarBusqueda');

  const term = ($('#buscarCliente').value || '').trim().toLowerCase();
  btnLimpiar.hidden = !term;

  let lista = [...clientesTodos];
  if (term) {
    const telLimpio = term.replace(/[^\d]/g, '').replace(/^52/, '');
    lista = lista.filter((c) =>
      String(c.Nombre || '').toLowerCase().includes(term) ||
      String(c.NumeroTelefono || '').includes(term) ||
      (telLimpio && String(c.NumeroTelefono || '').includes(telLimpio))
    );
  }
  if (filtroClientes === 'activos') lista.sort((a, b) => (b.totalMensajes || 0) - (a.totalMensajes || 0));
  if (filtroClientes === 'nuevos') lista.sort((a, b) => new Date(b.FechaRegistro) - new Date(a.FechaRegistro));

  $('#clientesCount').textContent = lista.length + ' de ' + clientesTodos.length + ' clientes';

  if (!lista.length) {
    cuerpo.innerHTML = `<tr><td colspan="6">${vacioHtml(clientesTodos.length ? 'No se encontraron clientes con esos criterios.' : 'Sin clientes registrados aún.')}</td></tr>`;
    return;
  }

  const maxMsg = Math.max(...lista.map((c) => c.totalMensajes || 0), 1);

  cuerpo.innerHTML = lista.map((c) => {
    const grad = avatarGradiente(c.NumeroTelefono || c.Nombre);
    const pct = Math.round(((c.totalMensajes || 0) / maxMsg) * 100);
    return `
      <tr>
        <td>
          <div class="celda-usuario">
            <div class="cliente-avatar" style="background:${grad};"><span class="stato"></span>${iniciales(c.Nombre)}</div>
            <div class="cliente-nombre">
              <b>${esc(c.Nombre)}</b>
              <span>${esc(c.NumeroTelefono)}</span>
            </div>
          </div>
        </td>
        <td><span class="wa-badge"><i class="fa-brands fa-whatsapp"></i> ${esc(c.NumeroTelefono)}</span></td>
        <td>${fmtFecha(c.FechaRegistro)}</td>
        <td>
          <div class="msg-cell">
            <div class="msg-barra"><span style="width:${pct}%;"></span></div>
            <b>${fmtNum(c.totalMensajes)}</b>
          </div>
        </td>
        <td><span class="relativo">${tiempoRelativo(c.ultimaActividad)}</span></td>
        <td><button type="button" class="btn-chat" data-numero="${escNumero(c.NumeroTelefono)}"><i class="fas fa-comment-dots"></i> Chat</button></td>
      </tr>`;
  }).join('');

  cuerpo.querySelectorAll('.btn-chat').forEach((btn) => {
    btn.addEventListener('click', () => irAChat(btn.dataset.numero));
  });
}

async function cargarClientes() {
  try {
    clientesTodos = await api('/admin/api/clientes');
    const totalMensajes = clientesTodos.reduce((a, c) => a + (c.totalMensajes || 0), 0);

    $('#kpisClientes').innerHTML = [
      kpiCard({ icono: 'fa-users', label: 'Total clientes', valor: fmtNum(clientesTodos.length), sub: fmtNum(clientesTodos.filter((c) => c.totalMensajes > 0).length) + ' con actividad', color: '#1e3a8a', fondo: '#eff6ff' }),
      kpiCard({ icono: 'fa-comment-dots', label: 'Mensajes enviados', valor: fmtNum(totalMensajes), sub: fmtNum(Math.round(totalMensajes / (clientesTodos.length || 1))) + ' por cliente', color: '#c3002f', fondo: '#fff1f4' }),
      kpiCard({ icono: 'fa-chart-simple', label: 'Cliente más activo', valor: totalMensajes ? (clientesTodos.reduce((a, b) => (a.totalMensajes > b.totalMensajes ? a : b)).Nombre || '—') : '—', color: '#16a34a', fondo: '#f0fdf4' }),
    ].join('');

    vincularFiltrosClientes();
    pintarClientes();
  } catch (e) {
    const cuerpo = $('#tablaClientes tbody');
    if (cuerpo) cuerpo.innerHTML = `<tr><td colspan="6">${vacioHtml(e.message)}</td></tr>`;
  }
}

/* ================= CITAS ================= */
let citasTodos = [];
let filtroCitas = 'todas';

function estadoKey(estado) {
  const e = (estado || '').toLowerCase();
  if (e.includes('confirm')) return 'confirmadas';
  if (e.includes('cancel')) return 'canceladas';
  return 'pendientes';
}

function colorSoft(texto) {
  let n = 0;
  for (const ch of String(texto || '')) n = (n + ch.charCodeAt(0)) % 997;
  const c = PALETA[n % PALETA.length];
  return { color: c, bg: c + '1f' };
}

function vincularFiltrosCitas() {
  const inp = $('#buscarCita');
  if (!inp || inp.dataset.vinc) return;
  inp.dataset.vinc = '1';
  inp.addEventListener('input', pintarCitas);
  $('#limpiarBusquedaCita').addEventListener('click', () => {
    inp.value = '';
    pintarCitas();
    inp.focus();
  });
  $('#filtroCitas').addEventListener('change', (e) => {
    filtroCitas = e.target.value;
    pintarCitas();
  });
}

function pintarCitas() {
  const cuerpo = $('#tablaCitas tbody');
  if (!cuerpo) return;
  const term = ($('#buscarCita').value || '').trim().toLowerCase();
  $('#limpiarBusquedaCita').hidden = !term;

  let lista = [...citasTodos];
  if (term) {
    const tel = term.replace(/[^\d]/g, '').replace(/^52/, '');
    lista = lista.filter((c) =>
      String(c.Nombre || '').toLowerCase().includes(term) ||
      String(c.Servicio || '').toLowerCase().includes(term) ||
      String(c.NumeroTelefono || '').includes(term) ||
      (tel && String(c.NumeroTelefono || '').includes(tel))
    );
  }
  if (filtroCitas !== 'todas') lista = lista.filter((c) => estadoKey(c.Estado) === filtroCitas);
  lista.sort((a, b) => new Date(b.FechaHora) - new Date(a.FechaHora));

  $('#citasCount').textContent = lista.length + ' de ' + citasTodos.length + ' citas';

  if (!lista.length) {
    cuerpo.innerHTML = `<tr><td colspan="7">${vacioHtml(citasTodos.length ? 'No hay citas con esos criterios.' : 'Aún no hay citas agendadas.')}</td></tr>`;
    return;
  }

  cuerpo.innerHTML = lista.map((c) => {
    const grad = avatarGradiente(c.NumeroTelefono || c.Nombre);
    const fecha = new Date(c.FechaHora);
    const stk = estadoKey(c.Estado);
    return `
      <tr>
        <td><span class="id-chip">#${c.Id}</span></td>
        <td>
          <div class="celda-usuario">
            <div class="cliente-avatar" style="background:${grad};"><span class="stato ${stk}"></span>${iniciales(c.Nombre)}</div>
            <div class="cliente-nombre"><b>${esc(c.Nombre)}</b><span>${esc(c.NumeroTelefono)}</span></div>
          </div>
        </td>
        <td><span class="wa-badge"><i class="fa-brands fa-whatsapp"></i> ${esc(c.NumeroTelefono)}</span></td>
        <td>${esc(c.Servicio)}</td>
        <td><span class="fecha-chip"><b>${fecha.getDate()}</b><span>${fecha.toLocaleDateString('es-MX', { month: 'short' })}</span></span></td>
        <td><span class="hora-celda">${fmtHora(c.FechaHora)}</span></td>
        <td>${estadoCita(c.Estado)}</td>
      </tr>`;
  }).join('');
}

async function cargarCitas() {
  try {
    citasTodos = await api('/admin/api/citas');
    const todas = citasTodos.length;
    const confirmadas = citasTodos.filter((c) => estadoKey(c.Estado) === 'confirmadas').length;
    const pendientes = todas - confirmadas;
    const proximas = citasTodos.filter((c) => estadoKey(c.Estado) === 'confirmadas' && new Date(c.FechaHora) >= new Date()).length;

    $('#kpisCitas').innerHTML = [
      kpiCard({ icono: 'fa-calendar-check', label: 'Total citas', valor: fmtNum(todas), sub: fmtNum(pendientes) + ' sin confirmar', color: '#16a34a', fondo: '#f0fdf4' }),
      kpiCard({ icono: 'fa-circle-check', label: 'Confirmadas', valor: fmtNum(confirmadas), sub: 'agendadas por el bot', color: '#1e3a8a', fondo: '#eff6ff' }),
      kpiCard({ icono: 'fa-hourglass-half', label: 'Próximas', valor: fmtNum(proximas), sub: 'confirmadas por venir', color: '#7c3aed', fondo: '#f5f3ff' }),
    ].join('');

    vincularFiltrosCitas();
    pintarCitas();
  } catch (e) {
    const c = $('#tablaCitas tbody');
    if (c) c.innerHTML = `<tr><td colspan="7">${vacioHtml(e.message)}</td></tr>`;
  }
}

/* ================= INVENTARIO ================= */
let productosTodos = [];
let filtroInventario = 'todos';

function vincularFiltrosInventario() {
  const inp = $('#buscarProducto');
  if (!inp || inp.dataset.vinc) return;
  inp.dataset.vinc = '1';
  inp.addEventListener('input', pintarInventario);
  $('#limpiarBusquedaProducto').addEventListener('click', () => {
    inp.value = '';
    pintarInventario();
    inp.focus();
  });
  $('#filtroInventario').addEventListener('change', (e) => {
    filtroInventario = e.target.value;
    pintarInventario();
  });
}

function pintarInventario() {
  const cuerpo = $('#tablaInventario tbody');
  if (!cuerpo) return;
  const term = ($('#buscarProducto').value || '').trim().toLowerCase();
  $('#limpiarBusquedaProducto').hidden = !term;

  let lista = [...productosTodos];
  if (term) {
    lista = lista.filter((p) =>
      String(p.NombreProducto || '').toLowerCase().includes(term) ||
      String(p.Descripcion || '').toLowerCase().includes(term) ||
      String(p.Categoria || '').toLowerCase().includes(term)
    );
  }
  if (filtroInventario === 'disponibles') lista = lista.filter((p) => (p.Stock || 0) > 5);
  if (filtroInventario === 'bajos') lista = lista.filter((p) => (p.Stock || 0) > 0 && (p.Stock || 0) <= 5);
  if (filtroInventario === 'agotados') lista = lista.filter((p) => (p.Stock || 0) === 0);

  const valorFiltrado = lista.reduce((a, p) => a + (p.Precio || 0) * (p.Stock || 0), 0);
  $('#productosCount').textContent = lista.length + ' de ' + productosTodos.length + ' productos';

  if (!lista.length) {
    cuerpo.innerHTML = `<tr><td colspan="5">${vacioHtml(productosTodos.length ? 'No hay productos con esos criterios.' : 'No hay productos registrados.')}</td></tr>`;
    return;
  }

  const maxStock = Math.max(...lista.map((p) => p.Stock || 0), 1);

  cuerpo.innerHTML = lista.map((p) => {
    const grad = avatarGradiente(p.NombreProducto);
    const col = colorSoft(p.Categoria);
    const pct = Math.round(((p.Stock || 0) / maxStock) * 100);
    return `
      <tr>
        <td>
          <div class="celda-usuario">
            <div class="prod-icona" style="background:${grad};"><i class="fas fa-box"></i></div>
            <div class="cliente-nombre">
              <b>${esc(p.NombreProducto)}</b>
              <span class="desc-corta" title="${esc(p.Descripcion)}">${esc(p.Descripcion)}</span>
            </div>
          </div>
        </td>
        <td><span class="cat-chip" style="color:${col.color};background:${col.bg};">${esc(p.Categoria)}</span></td>
        <td><span class="precio-celda">${fmtMoneda(p.Precio)}</span></td>
        <td>
          <div class="msg-cell">
            <div class="msg-barra ${p.Stock <= 0 ? 'barra-0' : p.Stock <= 5 ? 'barra-baja' : ''}"><span style="width:${pct}%;"></span></div>
            <b>${fmtNum(p.Stock)}</b>
          </div>
        </td>
        <td>${badgeStock(p.Stock)}</td>
      </tr>`;
  }).join('');
}

async function cargarInventario() {
  try {
    productosTodos = await api('/admin/api/inventario');
    const stockTotal = productosTodos.reduce((a, p) => a + (p.Stock || 0), 0);
    const valor = productosTodos.reduce((a, p) => a + (p.Precio || 0) * (p.Stock || 0), 0);
    const agotados = productosTodos.filter((p) => (p.Stock || 0) === 0).length;
    const masCaro = productosTodos.reduce((a, p) => ((p.Precio || 0) > (a.Precio || 0) ? p : a), { Precio: 0, NombreProducto: '—' });

    $('#kpisInventario').innerHTML = [
      kpiCard({ icono: 'fa-boxes-stacked', label: 'Productos', valor: fmtNum(productosTodos.length), sub: fmtNum(agotados) + ' agotados', color: '#ea580c', fondo: '#fff7ed' }),
      kpiCard({ icono: 'fa-cubes', label: 'Unidades en stock', valor: fmtNum(stockTotal), sub: 'piezas en almacén', color: '#0891b2', fondo: '#ecfeff' }),
      kpiCard({ icono: 'fa-money-bill-trend-up', label: 'Valor del inventario', valor: fmtMoneda(valor), sub: 'a precio de lista', color: '#16a34a', fondo: '#f0fdf4' }),
      kpiCard({ icono: 'fa-gem', label: 'Producto más caro', valor: '—', sub: esc(masCaro.NombreProducto) + ' · ' + fmtMoneda(masCaro.Precio), color: '#7c3aed', fondo: '#f5f3ff' }),
    ].join('');

    vincularFiltrosInventario();
    pintarInventario();
  } catch (e) {
    const c = $('#tablaInventario tbody');
    if (c) c.innerHTML = `<tr><td colspan="5">${vacioHtml(e.message)}</td></tr>`;
  }
}

/* ============ CHAT ESTILO WHATSAPP (reutilizable) ============ */
function crearChat(prefijo, config) {
  const S = {
    lateral: '#wasap' + prefijo + 'Lateral',
    lista: '#wasap' + prefijo + 'Lista',
    chat: '#wasap' + prefijo + 'Chat',
    cuerpo: '#wasap' + prefijo + 'Cuerpo',
    buscar: '#wasap' + prefijo + 'Buscar',
    btnLimpiar: '#wasap' + prefijo + 'BtnLimpiar',
    total: '#wasap' + prefijo + 'Total',
    tipos: '#wasap' + prefijo + 'Tipos',
  };
  const st = { chats: [], seleccionado: null, filtrados: [], tipoFiltro: null };

  async function cargar() {
    try {
      st.chats = await config.cargarChats();
      st.seleccionado = null;
      $(S.lateral).classList.remove('oculto');
      $(S.chat).classList.add('oculto');
      $(S.cuerpo).innerHTML = config.vacio;
      pintar();
    } catch (e) {
      $(S.lista).innerHTML = `<div class="wasap-aviso"><i class="fas fa-inbox"></i><p>${esc(e.message)}</p></div>`;
    }
  }

  function filtrar(term) {
    const t = (term || '').trim().toLowerCase();
    st.filtrados = st.chats.filter((c) => {
      if (st.tipoFiltro && !(c._tipos || []).some((x) => x.tipo === st.tipoFiltro)) return false;
      if (!t) return true;
      const terminoLimpio = t.replace(/[^\d]/g, '').replace(/^52/, '');
      const numeros = String(c.NumeroTelefono || '').toLowerCase();
      return String(c.Nombre || '').toLowerCase().includes(t) ||
        String(c.UltimoMensaje || '').toLowerCase().includes(t) ||
        numeros.includes(t) ||
        (terminoLimpio && numeros.includes(terminoLimpio));
    });
  }

  function pintarTipos() {
    const el = $(S.tipos);
    if (!config.menu || !el) return;
    const totales = {};
    st.chats.forEach((c) => {
      (c._tipos || []).forEach(({ tipo, n }) => { totales[tipo] = (totales[tipo] || 0) + n; });
    });
    const orden = ['Mensaje', 'Respuesta', 'Consulta IA', 'Consulta BD', 'Cita'];
    const chips = ['Todo'].concat(orden.filter((t) => totales[t] > 0));
    el.innerHTML = chips.map((tipo) => {
      const todo = tipo === 'Todo';
      const meta = todo ? { icono: 'fa-layer-group', color: 'var(--rojo)' } : (TIPO_META[tipo] || TIPO_META['Mensaje']);
      const n = todo ? st.chats.length : totales[tipo];
      const activo = (st.tipoFiltro === null && todo) || st.tipoFiltro === tipo;
      return `<button type="button" class="wasap-tipos-chip ${activo ? 'b' : ''}" data-tipo="${esc(tipo)}"><i class="fas ${meta.icono}"></i> ${todo ? 'Todo' : esc(etiquetaTipo(tipo))} <b>${fmtNum(n)}</b></button>`;
    }).join('');
    el.querySelectorAll('.wasap-tipos-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const t = chip.dataset.tipo;
        st.tipoFiltro = t === 'Todo' ? null : t;
        pintar();
      });
    });
  }

  function pintar() {
    const term = $(S.buscar).value;
    filtrar(term);
    pintarTipos();
    $(S.total).textContent = st.filtrados.length + (st.filtrados.length === 1 ? ' chat' : ' chats');
    $(S.btnLimpiar).hidden = !term;

    const lista = $(S.lista);
    if (!st.filtrados.length) {
      const hayChats = st.chats.length > 0;
      lista.innerHTML = `<div class="wasap-aviso"><i class="fas fa-inbox"></i><p>${hayChats ? 'No se encontraron resultados.' : 'Todavía no hay datos registrados.'}</p></div>`;
      return;
    }

    lista.innerHTML = st.filtrados.map((c) => {
      const activo = st.seleccionado === (c._key || c.NumeroTelefono);
      const k = c._key || c.NumeroTelefono;
      const grad = avatarGradiente(c.NumeroTelefono || c._key || c.Nombre);
      const inicial = (c.Nombre || 'S').trim().charAt(0).toUpperCase();
      const pre = String(c.UltimoMensaje || '').replace(/\n/g, ' ');
      const esSistema = !String(c.NumeroTelefono || '').trim();
      const filaInfo = config.menu
        ? `<div class="hist-pills">${(c._tipos || []).slice(0, 3).map(({ tipo, n }) => {
            const m = TIPO_META[tipo] || TIPO_META['Mensaje'];
            return `<span class="hist-pill" style="color:${m.color};background:${m.fondo};"><i class="fas ${m.icono}"></i> ${fmtNum(n)}</span>`;
          }).join('')}<span class="wasap-item-num">${c.TotalMensajes}</span></div>`
        : `<div class="wasap-item-fila">
             <span class="wasap-item-prevista"><i class="fas fa-${esSistema ? 'sparkles' : 'message'}"></i> ${esc(pre.slice(0, 60))}</span>
             <span class="wasap-item-num">${c.TotalMensajes}</span>
           </div>`;
      return `
        <div class="wasap-item ${activo ? 'activo' : ''}" data-key="${esc(k)}">
          <div class="wasap-avatar" style="background:${grad};">
            ${esSistema ? '<i class="fas fa-robot"></i>' : esc(inicial)}
          </div>
          <div class="wasap-item-info">
            <div class="wasap-item-fila">
              <b>${esc(c.Nombre)}</b>
              <span class="wasap-item-fecha">${fmtFechaChat(c.UltimaFecha)}</span>
            </div>
            ${filaInfo}
          </div>
        </div>`;
    }).join('');

    lista.querySelectorAll('.wasap-item').forEach((el) => {
      el.addEventListener('click', () => abrir(el.dataset.key));
    });
  }

  async function abrir(clave) {
    st.seleccionado = clave;
    $(S.lateral).classList.add('oculto');
    $(S.chat).classList.remove('oculto');
    pintar();
    const chat = $(S.cuerpo);
    chat.innerHTML = `<div class="wasap-cargando"><span class="wasap-tipeando"><b></b><b></b><b></b></span><span>Cargando conversación...</span></div>`;
    const volver = () => {
      st.seleccionado = null;
      $(S.lateral).classList.remove('oculto');
      $(S.chat).classList.add('oculto');
      pintar();
      chat.innerHTML = config.vacio;
    };
    try {
      const datos = await config.abrirChat(clave);
      config.renderChat(datos, chat);
      const btnVolver = chat.querySelector('.wasap-volver');
      if (btnVolver) btnVolver.addEventListener('click', volver);
    } catch (e) {
      chat.innerHTML = `<div class="wasap-chat-vacio"><i class="fas fa-inbox"></i><p>${esc(e.message)}</p></div>`;
    }
  }

  $(S.buscar).addEventListener('input', () => pintar());
  $(S.btnLimpiar).addEventListener('click', () => {
    $(S.buscar).value = '';
    pintar();
    $(S.buscar).focus();
  });

  return { cargar, abrir };
}

const VACIO_CONV = `
  <div class="wasap-chat-vacio">
    <i class="fas fa-comments"></i>
    <h3>Selecciona una conversación</h3>
    <p>Elige un contacto para ver el historial de mensajes completo.</p>
  </div>`;

const VACIO_HIST = `
  <div class="wasap-chat-vacio">
    <i class="fas fa-folder-open"></i>
    <h3>Selecciona un chat</h3>
    <p>Elige un cliente para ver toda su actividad: mensajes, respuestas, consultas IA/BD y citas.</p>
  </div>`;

/*** CONVERSACIONES (chat por cliente) ***/
wasapConversaciones = null;
function crearConversaciones() {
  return crearChat('Conv', {
    vacio: VACIO_CONV,
    cargarChats: () => api('/admin/api/historial-grupos'),
    abrirChat: (numero) => api('/admin/api/historial-mensajes?numero=' + encodeURIComponent(numero)),
    renderChat: renderChatWhatsApp,
  });
}

/*** HISTORIAL (agrupado por chat de cada cliente) ***/
function agruparActividades(actividades) {
  gruposHist = {};
  const grupos = new Map();
  (actividades || []).forEach((a) => {
    const tel = String(a.NumeroTelefono || '').trim();
    const key = tel || '!sistema';
    if (!grupos.has(key)) {
      const nombre = tel ? (a.Nombre && a.Nombre !== 'Cliente' ? a.Nombre : 'Cliente ' + tel) : 'Consultas IA / BD';
      grupos.set(key, { numero: tel, nombre, items: [] });
    }
    grupos.get(key).items.push(a);
  });

  const lista = [];
  grupos.forEach((g, key) => {
    g.items.sort((x, y) => new Date(x.FechaHora) - new Date(y.FechaHora));
    const ult = g.items[g.items.length - 1];
    const conteoTipos = {};
    g.items.forEach((a) => {
      const t = a.Tipo || 'Mensaje';
      conteoTipos[t] = (conteoTipos[t] || 0) + 1;
    });
    const tipos = Object.entries(conteoTipos).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n);
    gruposHist[key] = g;
    lista.push({
      _key: key,
      NumeroTelefono: g.numero,
      Nombre: g.nombre,
      TotalMensajes: g.items.length,
      UltimaFecha: ult.FechaHora,
      UltimoMensaje: g.numero ? String(ult.Detalle || '') : 'Consultas de IA y consultas a la BD',
      _tipos: tipos,
    });
  });
  lista.sort((x, y) => new Date(y.UltimaFecha) - new Date(x.UltimaFecha));
  return lista;
}

const TIPO_META = {
  'Mensaje': { icono: 'fa-message', color: '#1e3a8a', fondo: '#eff6ff' },
  'Respuesta': { icono: 'fa-robot', color: '#16a34a', fondo: '#f0fdf4' },
  'Consulta IA': { icono: 'fa-brain', color: '#7c3aed', fondo: '#f5f3ff' },
  'Consulta BD': { icono: 'fa-database', color: '#0d9488', fondo: '#f0fdfa' },
  'Cita': { icono: 'fa-calendar-check', color: '#d97706', fondo: '#fffbeb' },
};

function crearHistorial() {
  return crearChat('Hist', {
    menu: true,
    vacio: VACIO_HIST,
    cargarChats: async () => agruparActividades(await api('/admin/api/historial-actividades')),
    abrirChat: (clave) => {
      const grupo = gruposHist[clave] || { nombre: 'Cliente', numero: '', items: [] };
      return Promise.resolve({ nombre: grupo.nombre, tel: grupo.numero, items: grupo.items });
    },
    renderChat: renderHistorialChat,
  });
}

function etiquetaTipo(tipo) {
  return String(tipo || '').replace(/^Consulta /, '');
}

function fechaSeparador(d) {
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return primerMayus(d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }));
}

function renderChatWhatsApp(mensajes, contenedor) {
  const primero = mensajes[0] || {};
  const grad = avatarGradiente(primero.NumeroTelefono || primero.Nombre);
  contenedor.innerHTML = `
    <header class="wasap-chat-head">
      <button type="button" class="wasap-volver"><i class="fas fa-arrow-left"></i></button>
      <div class="wasap-avatar" style="background:${grad};"><span class="wasap-online"></span>${esc((primero.Nombre || 'C').charAt(0).toUpperCase())}</div>
      <div class="wasap-chat-head-info">
        <b>${esc(primero.Nombre || 'Cliente')}</b>
        <span>${esc(primero.NumeroTelefono || '')} · ${fmtNum(mensajes.length)} mensaje${mensajes.length === 1 ? '' : 's'}</span>
      </div>
    </header>
    <div class="wasap-mensajes"></div>
  `;

  const caja = contenedor.querySelector('.wasap-mensajes');
  if (!mensajes.length) {
    caja.innerHTML = `<div class="wasap-aviso"><i class="fas fa-inbox"></i><p>No hay mensajes en esta conversación.</p></div>`;
    return;
  }

  let diaAnterior = '';
  caja.innerHTML = mensajes.map((m) => {
    const d = new Date(m.Fecha);
    const claveDia = d.toDateString();
    let separador = '';
    if (claveDia !== diaAnterior) {
      separador = `<div class="wasap-separador">${esc(fechaSeparador(d))}</div>`;
    }
    diaAnterior = claveDia;

    const bubs = `
      <div class="wasap-burbuja cliente">
        <span class="wasap-burbuja-texto">${esc(m.TextoMensaje)}</span>
        <span class="wasap-burbuja-hora">${fmtHoraChat(m.Fecha)}<i class="fas fa-check-double chk"></i></span>
      </div>`;

    const resBot = (m.TextoRespuesta && String(m.TextoRespuesta).trim())
      ? `<div class="wasap-burbuja bot">
           <div class="wasap-b-bot"><i class="fas fa-robot"></i></div>
           <span class="wasap-burbuja-texto">${esc(m.TextoRespuesta)}</span>
           <span class="wasap-burbuja-hora">${fmtHoraChat(m.FechaRespuesta)}</span>
         </div>`
      : `<div class="wasap-burbuja bot">
           <div class="wasap-b-bot"><i class="fas fa-robot"></i></div>
           <span class="wasap-burbuja-texto wasap-sin-respuesta">Sin respuesta del bot</span>
         </div>`;

    return separador + bubs + resBot;
  }).join('');

  caja.scrollTop = caja.scrollHeight;
}

function renderHistorialChat(datos, contenedor) {
  const grad = avatarGradiente(datos.tel || datos.nombre);
  const esSistema = !String(datos.tel || '').trim();
  const porTipo = {};
  datos.items.forEach((a) => { porTipo[a.Tipo || ''] = (porTipo[a.Tipo || ''] || 0) + 1; });
  const resumen = Object.entries(porTipo)
    .map(([t, n]) => `${n} ${(t || 'mensaje').toLowerCase()}${n > 1 ? 's' : ''}`)
    .join(' · ');

  contenedor.innerHTML = `
    <header class="wasap-chat-head">
      <button type="button" class="wasap-volver"><i class="fas fa-arrow-left"></i></button>
      <div class="wasap-avatar" style="background:${grad};">${esSistema ? '<i class="fas fa-robot"></i>' : esc((datos.nombre || 'S').charAt(0).toUpperCase())}</div>
      <div class="wasap-chat-head-info">
        <b>${esc(datos.nombre)}</b>
        <span>${datos.tel ? esc(datos.tel) + ' · ' : ''}${fmtNum(datos.items.length)} actividades</span>
      </div>
    </header>
    <div class="wasap-mensajes"></div>
  `;

  const caja = contenedor.querySelector('.wasap-mensajes');
  if (!datos.items.length) {
    caja.innerHTML = `<div class="wasap-aviso"><i class="fas fa-inbox"></i><p>Sin actividad para este cliente.</p></div>`;
    return;
  }

  const resumenHtml = resumen ? `<div class="wasap-resumen"><i class="fas fa-chart-simple"></i> ${esc(resumen)}</div>` : '';

  let diaAnterior = '';
  caja.innerHTML = resumenHtml + datos.items.map((a) => {
    const d = new Date(a.FechaHora);
    const claveDia = d.toDateString();
    let separador = '';
    if (claveDia !== diaAnterior) {
      separador = `<div class="wasap-separador">${esc(fechaSeparador(d))}</div>`;
    }
    diaAnterior = claveDia;

    const meta = TIPO_META[a.Tipo] || TIPO_META['Mensaje'];
    const detalle = String(a.Detalle || '—').replace(/\n+/g, ' · ');
    const extra = a.Extra ? `<span class="act-extra"><i class="fas fa-tag"></i> ${esc(String(a.Extra))}</span>` : '';
    return separador + `
      <div class="act-item">
        <div class="act-icono" style="background:${meta.fondo};color:${meta.color};"><i class="fas ${meta.icono}"></i></div>
        <div class="act-info">
          <div class="act-fila">
            <span class="act-tipo" style="color:${meta.color};background:${meta.fondo};">${esc(a.Tipo)}</span>
            <span class="act-fecha"><i class="far fa-clock"></i> ${fmtHoraChat(a.FechaHora)}</span>
          </div>
          <div class="act-detalle" title="${esc(detalle)}">${esc(detalle)}</div>
          ${extra}
        </div>
      </div>`;
  }).join('');
  caja.scrollTop = caja.scrollHeight;
}

async function cargarConversaciones() {
  if (!wasapConversaciones) wasapConversaciones = crearConversaciones();
  await wasapConversaciones.cargar();
}

async function cargarHistorial() {
  if (!wasapHistorial) wasapHistorial = crearHistorial();
  await wasapHistorial.cargar();
}

/* ---------- Montaje del dashboard ---------- */
function renderDashboard() {
  const app = $('#app');
  const tpl = $('#tpl-dashboard');
  app.innerHTML = '';
  app.appendChild(tpl.content.cloneNode(true));

  document.body.className = '';

  charts = {};
  wasapConversaciones = null;
  wasapHistorial = null;
  gruposHist = {};

  const usuario = localStorage.getItem(USUARIO_KEY) || 'Administrador';
  $('#nombreUsuario').textContent = usuario;
  $('#avatarInicial').textContent = iniciales(usuario);

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('activo'));
      btn.classList.add('activo');
      const sec = btn.dataset.seccion;
      document.querySelectorAll('.seccion').forEach((s) => s.classList.remove('activa'));
      $('#seccion-' + sec).classList.add('activa');
      const [t, subt] = TITULOS[sec] || ['', ''];
      $('#tituloSeccion').textContent = t;
      $('#subtituloSeccion').textContent = subt;
      cargarSeccion(sec);
    });
  });

  $('#btnLogout').addEventListener('click', cerrarSesion);
  $('#btnRefrescar').addEventListener('click', () => cargarSeccion(seccionActual()));

  setupCharts();
  const urlSec = new URLSearchParams(location.search).get('seccion');
  const btnInicial = urlSec ? document.querySelector('.nav-item[data-seccion="' + urlSec + '"]') : null;
  if (btnInicial) btnInicial.click();
  else cargarResumen();
}

/* ---------- Arranque ---------- */
if (getToken()) {
  renderDashboard();
} else {
  renderLogin();
}