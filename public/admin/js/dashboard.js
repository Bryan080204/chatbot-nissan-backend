(function () {
  'use strict';

  const TOKEN = localStorage.getItem('admin_token');

  if (!TOKEN) {
    window.location.href = '/admin/login.html';
    return;
  }

  const $ = (sel) => document.querySelector(sel);

  let charts = {};

  function salir() {
    fetch('/admin/api/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN } }).catch(() => {});
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_usuario');
    window.location.href = '/admin/login.html';
  }

  async function api(url, opciones = {}) {
    const res = await fetch(url, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN,
        ...(opciones.headers || {}),
      },
    });
    if (res.status === 401) {
      salir();
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

  /* ---------- Navegación ---------- */
  const TITULOS = {
    resumen: ['Resumen general', 'Actividad del chatbot WhatsApp en tiempo real'],
    clientes: ['Clientes', 'Todos los clientes registrados por el chatbot'],
    citas: ['Citas', 'Agendamientos de taller registrados'],
    conversaciones: ['Conversaciones', 'Últimos intercambios entre clientes y el bot'],
    inventario: ['Inventario', 'Catálogo de productos y stock'],
    historial: ['Historial de actividad', 'Registro de mensajes, respuestas, consultas IA, consultas a BD y citas'],
  };

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('activo'));
      btn.classList.add('activo');
      const sec = btn.dataset.seccion;
      document.querySelectorAll('.seccion').forEach((s) => s.classList.remove('activa'));
      $('#seccion-' + sec).classList.add('activa');
      const [t, st] = TITULOS[sec] || ['', ''];
      $('#tituloSeccion').textContent = t;
      $('#subtituloSeccion').textContent = st;
      cargarSeccion(sec);
    });
  });

  $('#btnLogout').addEventListener('click', salir);
  $('#btnRefrescar').addEventListener('click', () => cargarSeccion(seccionActual()));

  function seccionActual() {
    return document.querySelector('.nav-item.activo').dataset.seccion;
  }

  /* ---------- Inicialización ---------- */
  function setupCharts() {
    const opts = (titulo, color) => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { color: '#64748b', font: { size: 11 }, precision: 0 }, grid: { color: '#f1f5f9' } },
      },
    });

    charts.dias = new Chart($('#chartDias'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Mensajes', data: [], borderColor: '#c3002f', backgroundColor: 'rgba(195,0,47,.12)', fill: true, tension: .4, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#c3002f' }] },
      options: opts(),
    });

    charts.horas = new Chart($('#chartHoras'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Mensajes', data: [], backgroundColor: '#1e3a8a', borderRadius: 6, maxBarThickness: 26 }] },
      options: opts(),
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

    charts.citasDia = new Chart($('#chartCitasDia'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Citas', data: [], backgroundColor: '#7c3aed', borderRadius: 6, maxBarThickness: 26 }] },
      options: opts(),
    });

    charts.clientesDia = new Chart($('#chartClientesDia'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Clientes', data: [], borderColor: '#1e3a8a', backgroundColor: 'rgba(30,58,138,.12)', fill: true, tension: .4, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#1e3a8a' }] },
      options: opts(),
    });

    charts.inventario = new Chart($('#chartInventario'), {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: PALETA, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#0f172a', font: { size: 11 }, padding: 10, boxWidth: 10 } },
        },
      },
    });

    charts.citasEstado = new Chart($('#chartCitasEstado'), {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: ['#7c3aed', '#d97706', '#dc2626', '#94a3b8'], borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#0f172a', font: { size: 11 }, padding: 10, boxWidth: 10 } },
        },
      },
    });
  }

  /* ---------- Carga por sección ---------- */
  async function cargarSeccion(sec) {
    if (sec === 'resumen') return cargarResumen();
    if (sec === 'clientes') return cargarClientes();
    if (sec === 'citas') return cargarCitas();
    if (sec === 'conversaciones') return cargarConversaciones();
    if (sec === 'inventario') return cargarInventario();
    if (sec === 'historial') return cargarHistorial();
  }

  /* ================= RESUMEN ================= */
  let datosResumen = null;

  async function obtenerKpis() {
    if (datosResumen && datosResumen.kpis) return datosResumen.kpis;
    datosResumen = await api('/admin/api/stats');
    return datosResumen.kpis;
  }

  async function cargarResumen() {
    const btn = $('#btnRefrescar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    try {
      datosResumen = await api('/admin/api/stats');
      pintarKPIs(datosResumen.kpis);
      pintarGraficas(datosResumen);
      pintarActividad(datosResumen.ultimasActividades, datosResumen.proximasCitas, datosResumen.topClientes);
      pintarResumenConsultas(datosResumen.kpis);
    } catch (e) {
      const el = $('#actividadReciente');
      if (el) el.innerHTML = vacioHtml(e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-rotate"></i> Actualizar';
    }
  }

  function pintarKPIs(k) {
    $('#kpisGeneral').innerHTML = [
      kpiCard({ icono: 'fa-users', label: 'Clientes', valor: fmtNum(k.totalClientes), sub: '+' + fmtNum(k.clientesHoy) + ' hoy · ' + fmtNum(k.clientesActivosHoy) + ' activos', color: '#1e3a8a', fondo: '#eff6ff' }),
      kpiCard({ icono: 'fa-comment-dots', label: 'Mensajes recibidos', valor: fmtNum(k.totalMensajes), sub: '+' + fmtNum(k.mensajesHoy) + ' hoy', color: '#c3002f', fondo: '#fff1f4' }),
      kpiCard({ icono: 'fa-reply', label: 'Respuestas del bot', valor: fmtNum(k.totalRespuestas), sub: '+' + fmtNum(k.respuestasHoy) + ' hoy', color: '#16a34a', fondo: '#f0fdf4' }),
      kpiCard({ icono: 'fa-calendar-check', label: 'Citas confirmadas', valor: fmtNum(k.totalCitas), sub: fmtNum(k.citasPendientes) + ' pendientes', color: '#7c3aed', fondo: '#f5f3ff' }),
      kpiCard({ icono: 'fa-clock', label: 'Citas próximas', valor: fmtNum(k.citasProximas), sub: fmtNum(k.citasHoy) + ' para hoy', color: '#d97706', fondo: '#fffbeb' }),
      kpiCard({ icono: 'fa-robot', label: 'Consultas a la IA', valor: fmtNum(k.consultasIA), sub: '+' + fmtNum(k.consultasHoy) + ' hoy', color: '#0891b2', fondo: '#ecfeff' }),
      kpiCard({ icono: 'fa-boxes-stacked', label: 'Productos', valor: fmtNum(k.totalProductos), sub: fmtNum(k.stockTotal) + ' unidades', color: '#ea580c', fondo: '#fff7ed' }),
      kpiCard({ icono: 'fa-money-bill-trend-up', label: 'Valor inventario', valor: fmtMoneda(k.valorInventario).replace(',', ' '), color: '#dc2626', fondo: '#fef2f2' }),
    ];

    $('#kpisHoy').innerHTML = [
      miniKpi('Hoy', { 'Clientes nuevos': k.clientesHoy, 'Mensajes': k.mensajesHoy, 'Citas': k.citasHoy, 'Respondidas': k.respuestasHoy, 'Consultas IA': k.consultasHoy, 'Sin respuesta': k.mensajesSinRespuesta, 'Clientes activos': k.clientesActivosHoy }),
    ].join('');
  }

  function miniKpi(titulo, items) {
    const chips = Object.entries(items)
      .filter(([, v]) => v !== undefined)
      .map(([label, val]) => `<span class="strip-chip"><b>${fmtNum(val)}</b> ${esc(label)}</span>`).join('');
    return `<div class="strip-card"><div class="strip-titulo"><i class="fas fa-bolt"></i> ${esc(titulo)}</div><div class="strip-chips">${chips}</div></div>`;
  }

  function pintarResumenConsultas(k) {
    const el = $('#resumenConsultas');
    if (!el) return;
    const pendientes = k.mensajesSinRespuesta || 0;
    const total = (k.totalMensajes || 0) + (k.totalRespuestas || 0);
    const tasa = total ? Math.round(((k.totalRespuestas || 0) / total) * 100) : 0;
    el.innerHTML = `
      <div class="consultas-grid">
        <div class="consulta-item">
          <div class="consulta-icono"><i class="fas fa-message"></i></div>
          <b>${fmtNum(k.totalMensajes)}</b><span>Mensajes de clientes</span>
        </div>
        <div class="consulta-item">
          <div class="consulta-icono"><i class="fas fa-robot"></i></div>
          <b>${fmtNum(k.totalRespuestas)}</b><span>Respuestas del bot</span>
        </div>
        <div class="consulta-item">
          <div class="consulta-icono"><i class="fas fa-puzzle-piece"></i></div>
          <b>${fmtNum(k.consultasIA)}</b><span>Prompts a la IA</span>
        </div>
        <div class="consulta-item">
          <div class="consulta-icono"><i class="fas fa-database"></i></div>
          <b>${fmtNum(k.consultasHoy)}</b><span>Consultas a BD hoy</span>
        </div>
        <div class="consulta-item">
          <div class="consulta-icono"><i class="fas fa-envelope-open-text"></i></div>
          <b>${fmtNum(pendientes)}</b><span>Mensajes sin respuesta</span>
        </div>
        <div class="consulta-item">
          <div class="consulta-icono"><i class="fas fa-percent"></i></div>
          <b>${tasa}%</b><span>Tasa de respuesta</span>
        </div>
      </div>`;
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

    const proximos7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    });
    const mapaCitasDia = {};
    (datos.citasPorDia || []).forEach((r) => {
      mapaCitasDia[new Date(r.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })] = r.total;
    });
    charts.citasDia.data.labels = proximos7;
    charts.citasDia.data.datasets[0].data = proximos7.map((d) => mapaCitasDia[d] || 0);
    charts.citasDia.update();

    const mapaClientesDia = {};
    (datos.clientesPorDia || []).forEach((r) => {
      mapaClientesDia[new Date(r.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })] = r.total;
    });
    charts.clientesDia.data.labels = dias7;
    charts.clientesDia.data.datasets[0].data = dias7.map((d) => mapaClientesDia[d] || 0);
    charts.clientesDia.update();

    charts.inventario.data.labels = (datos.inventarioPorCategoria || []).map((r) => r.Categoria);
    charts.inventario.data.datasets[0].data = (datos.inventarioPorCategoria || []).map((r) => r.unidades);
    charts.inventario.update();

    const estados = (datos.citasPorEstado || []).map((r) => r.estado);
    const coloresEstado = (datos.citasPorEstado || []).map((r) => {
      const e = (r.estado || '').toLowerCase();
      if (e.includes('confirm')) return '#7c3aed';
      if (e.includes('pend')) return '#d97706';
      if (e.includes('cancel')) return '#dc2626';
      return '#94a3b8';
    });
    charts.citasEstado.data.labels = estados;
    charts.citasEstado.data.datasets[0].backgroundColor = coloresEstado;
    charts.citasEstado.data.datasets[0].data = (datos.citasPorEstado || []).map((r) => r.total);
    charts.citasEstado.update();
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
          <div style="text-align:right;font-size:12.5px;font-weight:600;color:#16a34a;">${new Date(c.FechaHora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} ${new Date(c.FechaHora).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</div>
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

  /* ================= CLIENTES ================= */
  async function cargarClientes() {
    try {
      const clientes = await api('/admin/api/clientes');
      const k = await obtenerKpis();
      const totalMensajes = clientes.reduce((a, c) => a + (c.totalMensajes || 0), 0);

      $('#kpisClientes').innerHTML = [
        kpiCard({ icono: 'fa-users', label: 'Total clientes', valor: fmtNum(clientes.length), color: '#1e3a8a', fondo: '#eff6ff' }),
        kpiCard({ icono: 'fa-comment-dots', label: 'Mensajes enviados', valor: fmtNum(totalMensajes), color: '#c3002f', fondo: '#fff1f4' }),
      ];

      $('#stripClientes').innerHTML = miniKpi('Clientes', {
        'Nuevos hoy': k.clientesHoy,
        'Activos hoy': k.clientesActivosHoy,
        'Mensajes hoy': k.mensajesHoy,
        'Respuestas hoy': k.respuestasHoy,
        'Total mensajes': totalMensajes,
      });

      const cuerpo = $('#tablaClientes tbody');
      if (!clientes.length) {
        cuerpo.innerHTML = `<tr><td colspan="5"><div class="vacio">${vacioIcono()}Sin clientes registrados aún.</div></td></tr>`;
        return;
      }
      cuerpo.innerHTML = clientes.map((c) => `
        <tr>
          <td><div class="celda-usuario"><div class="mini-avatar">${iniciales(c.Nombre)}</div><b>${esc(c.Nombre)}</b></div></td>
          <td><span class="numero">${esc(c.NumeroTelefono)}</span></td>
          <td>${fmtFecha(c.FechaRegistro)}</td>
          <td><span class="numero">${fmtNum(c.totalMensajes)}</span></td>
          <td>${fmtFechaHora(c.ultimaActividad)}</td>
        </tr>`).join('');
    } catch (e) {
      $('#tablaClientes tbody').innerHTML = `<tr><td colspan="5"><div class="vacio">${vacioIcono()}${esc(e.message)}</div></td></tr>`;
    }
  }

  /* ================= CITAS ================= */
  async function cargarCitas() {
    try {
      const citas = await api('/admin/api/citas');
      const k = await obtenerKpis();
      const confirmadas = citas.filter((c) => (c.Estado || '').toLowerCase().includes('confirm')).length;
      const proximas = citas.filter((c) => (c.Estado || '').toLowerCase().includes('confirm') && new Date(c.FechaHora) >= new Date()).length;

      $('#kpisCitas').innerHTML = [
        kpiCard({ icono: 'fa-calendar-check', label: 'Total citas', valor: fmtNum(citas.length), color: '#16a34a', fondo: '#f0fdf4' }),
        kpiCard({ icono: 'fa-circle-check', label: 'Confirmadas', valor: fmtNum(confirmadas), color: '#1e3a8a', fondo: '#eff6ff' }),
        kpiCard({ icono: 'fa-hourglass-half', label: 'Próximas', valor: fmtNum(proximas), color: '#7c3aed', fondo: '#f5f3ff' }),
      ];

      $('#stripCitas').innerHTML = miniKpi('Citas', {
        'Confirmadas': confirmadas,
        'Próximas': proximas,
        'Pendientes': k.citasPendientes,
        'Para hoy': k.citasHoy,
      });

      const cuerpo = $('#tablaCitas tbody');
      if (!citas.length) {
        cuerpo.innerHTML = `<tr><td colspan="7"><div class="vacio">${vacioIcono()}Aún no hay citas agendadas.</div></td></tr>`;
        return;
      }
      cuerpo.innerHTML = citas.map((c) => `
        <tr>
          <td><span class="numero">#${c.Id}</span></td>
          <td><div class="celda-usuario"><div class="mini-avatar">${iniciales(c.Nombre)}</div><b>${esc(c.Nombre)}</b></div></td>
          <td><span class="numero">${esc(c.NumeroTelefono)}</span></td>
          <td>${esc(c.Servicio)}</td>
          <td>${fmtFecha(c.FechaHora)}</td>
          <td>${fmtHora(c.FechaHora)}</td>
          <td>${estadoCita(c.Estado)}</td>
        </tr>`).join('');
    } catch (e) {
      $('#tablaCitas tbody').innerHTML = `<tr><td colspan="7"><div class="vacio">${vacioIcono()}${esc(e.message)}</div></td></tr>`;
    }
  }

  /* ================= CONVERSACIONES ================= */
  async function cargarConversaciones() {
    await iniciarWasap('Conv');
  }

  /* ================= INVENTARIO ================= */
  async function cargarInventario() {
    try {
      const productos = await api('/admin/api/inventario');
      const stockTotal = productos.reduce((a, p) => a + (p.Stock || 0), 0);
      const valor = productos.reduce((a, p) => a + (p.Precio || 0) * (p.Stock || 0), 0);
      const agotados = productos.filter((p) => (p.Stock || 0) === 0).length;

      $('#kpisInventario').innerHTML = [
        kpiCard({ icono: 'fa-boxes-stacked', label: 'Productos', valor: fmtNum(productos.length), color: '#ea580c', fondo: '#fff7ed' }),
        kpiCard({ icono: 'fa-cubes', label: 'Unidades en stock', valor: fmtNum(stockTotal), color: '#0891b2', fondo: '#ecfeff' }),
        kpiCard({ icono: 'fa-money-bill-trend-up', label: 'Valor del inventario', valor: fmtMoneda(valor), color: '#16a34a', fondo: '#f0fdf4' }),
        kpiCard({ icono: 'fa-triangle-exclamation', label: 'Agotados', valor: fmtNum(agotados), color: '#dc2626', fondo: '#fef2f2' }),
      ];

      const todos = productos.length || 0;
      const stockBajo = productos.filter((p) => (p.Stock || 0) > 0 && (p.Stock || 0) <= 5).length;
      $('#stripInventario').innerHTML = miniKpi('Inventario', {
        'Productos': todos,
        'Unidades': stockTotal,
        'Agotados': agotados,
        'Stock bajo': stockBajo,
        'Valor': fmtMoneda(valor),
      });

      const cuerpo = $('#tablaInventario tbody');
      if (!productos.length) {
        cuerpo.innerHTML = `<tr><td colspan="6"><div class="vacio">${vacioIcono()}No hay productos registrados.</div></td></tr>`;
        return;
      }
      cuerpo.innerHTML = productos.map((p) => `
        <tr>
          <td><b>${esc(p.NombreProducto)}</b></td>
          <td>${esc(p.Descripcion)}</td>
          <td>${esc(p.Categoria)}</td>
          <td>${fmtMoneda(p.Precio)}</td>
          <td><span class="numero">${fmtNum(p.Stock)}</span></td>
          <td>${badgeStock(p.Stock)}</td>
        </tr>`).join('');
    } catch (e) {
      $('#tablaInventario tbody').innerHTML = `<tr><td colspan="6"><div class="vacio">${vacioIcono()}${esc(e.message)}</div></td></tr>`;
    }
  }

  /* ================= CHAT WHATSAPP (reutilizable) ================= */
  function crearWasap(prefijo) {
    const S = {
      lateral: '#wasap' + prefijo + 'Lateral',
      lista: '#wasap' + prefijo + 'Lista',
      chat: '#wasap' + prefijo + 'Chat',
      buscar: '#wasap' + prefijo + 'Buscar',
      btnLimpiar: '#wasap' + prefijo + 'BtnLimpiar',
      total: '#wasap' + prefijo + 'Total',
    };
    const st = { chats: [], seleccionado: null, filtrados: [] };

    async function cargar() {
      try {
        const chats = await api('/admin/api/historial-grupos');
        st.chats = chats;
        st.seleccionado = null;
        $(S.lateral).classList.remove('oculto');
        $(S.chat).classList.add('oculto');
        $(S.chat).innerHTML = `
          <div class="wasap-chat-vacio">
            <i class="fas fa-comments"></i>
            <h3>Selecciona una conversación</h3>
            <p>Elige un contacto para ver el historial de mensajes completo.</p>
          </div>`;
        pintar();
      } catch (e) {
        $(S.lista).innerHTML = `<div class="wasap-aviso">${vacioIcono()}<p>${esc(e.message)}</p></div>`;
      }
    }

    function filtrar(term) {
      const t = (term || '').trim().toLowerCase();
      if (!t) { st.filtrados = st.chats; return; }
      st.filtrados = st.chats.filter((c) =>
        String(c.Nombre || '').toLowerCase().includes(t) ||
        String(c.NumeroTelefono || '').toLowerCase().includes(t.replace(/[^\d]/g, '').replace(/^52/, '')) ||
        String(c.NumeroTelefono || '').toLowerCase().includes(t)
      );
    }

    function pintar() {
      const term = $(S.buscar).value;
      filtrar(term);
      $(S.total).textContent = st.filtrados.length + (st.filtrados.length === 1 ? ' chat' : ' chats');
      $(S.btnLimpiar).hidden = !term;

      const lista = $(S.lista);
      if (!st.filtrados.length) {
        const hayChats = st.chats.length > 0;
        lista.innerHTML = `<div class="wasap-aviso">${vacioIcono()}<p>${hayChats ? 'No se encontraron resultados.' : 'Todavía no hay mensajes registrados.'}</p></div>`;
        return;
      }

      lista.innerHTML = st.filtrados.map((c) => {
        const activo = st.seleccionado === c.NumeroTelefono;
        const inicial = (c.Nombre || '?').trim().charAt(0).toUpperCase();
        const color = avatarColor(c.NumeroTelefono);
        const pre = (c.UltimoMensaje || '').replace(/\n/g, ' ');
        return `
          <div class="wasap-item ${activo ? 'activo' : ''}" data-numero="${esc(c.NumeroTelefono)}">
            <div class="wasap-avatar" style="background:${color};">${esc(inicial)}</div>
            <div class="wasap-item-info">
              <div class="wasap-item-fila">
                <b>${esc(c.Nombre)}</b>
                <span class="wasap-item-fecha">${fmtFechaChat(c.UltimaFecha)}</span>
              </div>
              <div class="wasap-item-fila">
                <span class="wasap-item-prevista"><i class="fas fa-message" style="font-size:10px;"></i> ${esc(pre.slice(0, 60))}</span>
                <span class="wasap-item-num">${c.TotalMensajes}</span>
              </div>
            </div>
          </div>`;
      }).join('');

      lista.querySelectorAll('.wasap-item').forEach((el) => {
        el.addEventListener('click', () => abrir(el.dataset.numero));
      });
    }

    async function abrir(numero) {
      st.seleccionado = numero;
      $(S.lateral).classList.add('oculto');
      $(S.chat).classList.remove('oculto');
      pintar();
      const chat = $(S.chat);
      chat.innerHTML = `<div class="wasap-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando conversación...</div>`;
      try {
        const mensajes = await api('/admin/api/historial-mensajes?numero=' + encodeURIComponent(numero));
        pintarChat(mensajes, chat);
      } catch (e) {
        chat.innerHTML = `<div class="wasap-chat-vacio">${vacioIcono()}<p>${esc(e.message)}</p></div>`;
      }
    }

    function pintarChat(mensajes, contenedor) {
      const primero = mensajes[0] || {};
      const color = avatarColor(primero.NumeroTelefono);
      contenedor.innerHTML = `
        <header class="wasap-chat-head">
          <button type="button" class="wasap-volver"><i class="fas fa-arrow-left"></i></button>
          <div class="wasap-avatar" style="background:${color};">${esc((primero.Nombre || '?').charAt(0).toUpperCase())}</div>
          <div class="wasap-chat-head-info">
            <b>${esc(primero.Nombre || 'Cliente')}</b>
            <span>${esc(primero.NumeroTelefono || '')} · ${fmtNum(mensajes.length)} mensajes</span>
          </div>
        </header>
        <div class="wasap-mensajes"></div>
      `;

      contenedor.querySelector('.wasap-volver').addEventListener('click', () => {
        st.seleccionado = null;
        $(S.lateral).classList.remove('oculto');
        $(S.chat).classList.add('oculto');
        pintar();
        contenedor.innerHTML = `
          <div class="wasap-chat-vacio">
            <i class="fas fa-comments"></i>
            <h3>Selecciona una conversación</h3>
            <p>Elige un contacto para ver el historial de mensajes completo.</p>
          </div>`;
      });

      const caja = contenedor.querySelector('.wasap-mensajes');
      if (!mensajes.length) {
        caja.innerHTML = `<div class="wasap-aviso">${vacioIcono()}<p>No hay mensajes en esta conversación.</p></div>`;
        return;
      }

      let diaAnterior = '';
      caja.innerHTML = mensajes.map((m) => {
        const d = new Date(m.Fecha);
        const claveDia = d.toDateString();
        let separador = '';
        if (claveDia !== diaAnterior) {
          const fechaBubble = d.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
          separador = `<div class="wasap-separador">${esc(primerMayus(fechaBubble))}</div>`;
        }
        diaAnterior = claveDia;

        const bubs = `
          <div class="wasap-burbuja cliente">
            <span class="wasap-burbuja-texto">${esc(m.TextoMensaje)}</span>
            <span class="wasap-burbuja-hora">${fmtHoraChat(m.Fecha)}</span>
          </div>`;

        const resBot = (m.TextoRespuesta && String(m.TextoRespuesta).trim())
          ? `<div class="wasap-burbuja bot">
               <div class="wasap-b-bot">B</div>
               <span class="wasap-burbuja-texto">${esc(m.TextoRespuesta)}</span>
               <span class="wasap-burbuja-hora">${fmtHoraChat(m.FechaRespuesta)}</span>
             </div>`
          : `<div class="wasap-burbuja bot">
               <div class="wasap-b-bot">B</div>
               <span class="wasap-burbuja-texto wasap-sin-respuesta">Sin respuesta registrada</span>
             </div>`;

        return separador + bubs + resBot;
      }).join('');

      caja.scrollTop = caja.scrollHeight;
    }

    $(S.buscar).addEventListener('input', () => pintar());
    $(S.btnLimpiar).addEventListener('click', () => {
      $(S.buscar).value = '';
      pintar();
      $(S.buscar).focus();
    });

    return { cargar };
  }

  const wasapConversaciones = crearWasap('Conv');

  async function cargarConversaciones() {
    await wasapConversaciones.cargar();
  }

  /* ================= HISTORIAL DE ACTIVIDADES ================= */
  let actividades = [];
  let filtroActHist = 'todos';

  const TIPO_META = {
    'Mensaje': { icono: 'fa-message', color: '#1e3a8a', fondo: '#eff6ff' },
    'Respuesta': { icono: 'fa-robot', color: '#16a34a', fondo: '#f0fdf4' },
    'Consulta IA': { icono: 'fa-brain', color: '#7c3aed', fondo: '#f5f3ff' },
    'Consulta BD': { icono: 'fa-database', color: '#0d9488', fondo: '#f0fdfa' },
    'Cita': { icono: 'fa-calendar-check', color: '#d97706', fondo: '#fffbeb' },
  };

  async function cargarHistorial() {
    try {
      actividades = await api('/admin/api/historial-actividades');
      filtroActHist = 'todos';
      $('#actBuscar2').value = '';
      $('#actBtnLimpiar2').hidden = true;
      pintarActChips();
      pintarActividades();
    } catch (e) {
      $('#actLista').innerHTML = `<div class="act-aviso">${vacioIcono()}<p>${esc(e.message)}</p></div>`;
    }
  }

  function pintarActChips() {
    const conteo = {};
    actividades.forEach((a) => { conteo[a.Tipo] = (conteo[a.Tipo] || 0) + 1; });
    const orden = ['Mensaje', 'Respuesta', 'Consulta IA', 'Consulta BD', 'Cita'];
    let chips = '';
    orden.forEach((t) => {
      if (!conteo[t]) return;
      const activo = filtroActHist === t ? ' b' : '';
      const icono = TIPO_META[t].icono;
      chips += `<span class="strip-chip act-chip${activo}" data-tipo="${esc(t)}"><i class="fas ${icono}"></i> ${esc(tipoLargo(t))} <b>${fmtNum(conteo[t])}</b></span>`;
    });
    const total = actividades.length;
    chips = `<span class="strip-chip act-chip${filtroActHist === 'todos' ? ' b' : ''}" data-tipo="todos"><i class="fas fa-layer-group"></i> Todo <b>${fmtNum(total)}</b></span>` + chips;
    $('#actChips').innerHTML = chips;
  }

  function tipoLargo(t) {
    return { 'Mensaje': 'Mensajes', 'Respuesta': 'Respuestas', 'Consulta IA': 'Consultas IA', 'Consulta BD': 'Consultas BD', 'Cita': 'Citas' }[t] || t;
  }

  function pintarActividades() {
    const lista = $('#actLista');
    const term = ($('#actBuscar2').value || '').trim().toLowerCase();
    const visibles = actividades.filter((a) => {
      if (filtroActHist !== 'todos' && a.Tipo !== filtroActHist) return false;
      if (!term) return true;
      const extra = `${a.Detalle || ''} ${a.Nombre || ''} ${a.NumeroTelefono || ''} ${a.Extra || ''} ${a.Tipo}`.toLowerCase();
      return extra.includes(term);
    });

    if (!visibles.length) {
      lista.innerHTML = `<div class="act-aviso">${vacioIcono()}<p>${actividades.length ? 'No hay coincidencias.' : 'Todavía no hay actividad registrada.'}</p></div>`;
      return;
    }

    const grupos = new Map();
    visibles.forEach((a) => {
      const esSistema = (a.NumeroTelefono || '').trim() === '';
      const key = esSistema ? 'sistema-' + a.Tipo : a.NumeroTelefono;
      const nombre = esSistema ? tipoLargo(a.Tipo) : (a.Nombre && a.Nombre !== 'Cliente' ? a.Nombre : 'Cliente');
      if (!grupos.has(key)) grupos.set(key, { nombre, tel: a.NumeroTelefono || '', items: [], sistema: esSistema });
      grupos.get(key).items.push(a);
    });

    let html = '';
    grupos.forEach((g, key) => {
      const color = g.sistema ? '#334155' : avatarColor(key + g.tel);
      const inicial = g.sistema ? '<i class="fa-solid fa-server"></i>' : esc((g.nombre || '?').charAt(0).toUpperCase());
      const itemsHtml = g.items.map((a) => {
        const meta = TIPO_META[a.Tipo] || TIPO_META['Mensaje'];
        const detalle = String(a.Detalle || '—').replace(/\n+/g, ' · ');
        const extra = a.Extra ? `<span class="act-extra">${esc(String(a.Extra))}</span>` : '';
        return `
          <div class="act-item">
            <div class="act-icono" style="background:${meta.fondo};color:${meta.color};"><i class="fas ${meta.icono}"></i></div>
            <div class="act-info">
              <div class="act-fila">
                <span class="act-tipo" style="color:${meta.color};background:${meta.fondo};">${esc(a.Tipo)}</span>
                <span class="act-fecha">${fmtFechaHora(a.FechaHora)}</span>
              </div>
              <div class="act-detalle" title="${esc(detalle)}">${esc(detalle)}</div>
              ${extra}
            </div>
          </div>`;
      }).join('');
      html += `
        <div class="act-grupo ${g.sistema ? 'sistema' : ''}">
          <div class="act-grupo-head">
            <div class="wasap-avatar act-g-avatar" style="background:${color};">${inicial}</div>
            <div class="act-grupo-info">
              <b>${esc(g.nombre)}</b>
              ${g.tel ? `<span class="act-tel"><i class="fas fa-phone"></i> ${esc(g.tel)}</span>` : (g.sistema ? '<span class="act-tel"><i class="fas fa-database"></i> Actividad interna del sistema</span>' : '')}
            </div>
            <span class="act-grupo-n">${g.items.length} ${g.items.length === 1 ? 'actividad' : 'actividades'}</span>
          </div>
          ${itemsHtml}
        </div>`;
    });

    lista.innerHTML = html;
  }

  let timerBuscar = null;
  $('#actBuscar2').addEventListener('input', (e) => {
    $('#actBtnLimpiar2').hidden = !(e.target.value || '');
    clearTimeout(timerBuscar);
    timerBuscar = setTimeout(() => pintarActividades(), 220);
  });
  $('#actBtnLimpiar2').addEventListener('click', () => {
    $('#actBuscar2').value = '';
    $('#actBtnLimpiar2').hidden = true;
    pintarActividades();
    $('#actBuscar2').focus();
  });
  $('#actChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.act-chip');
    if (!chip) return;
    filtroActHist = chip.dataset.tipo;
    pintarActChips();
    pintarActividades();
  });

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

  function avatarColor(numero) {
    const colores = ['#c3002f', '#1e3a8a', '#ea580c', '#16a34a', '#7c3aed', '#0891b2', '#d97706', '#dc2626', '#4f46e5', '#0d9488'];
    let n = 0;
    for (const ch of String(numero || '')) n = (n + ch.charCodeAt(0)) % 997;
    return colores[n % colores.length];
  }

  function primerMayus(s) {
    return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  }

  function vacioHtml(msg) {
    return `<div class="vacio">${vacioIcono()}<p>${esc(msg)}</p></div>`;
  }
  function vacioIcono() {
    return '<i class="fas fa-inbox"></i>';
  }

  /* ---------- Arranque ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const usuario = localStorage.getItem('admin_usuario') || 'Administrador';
    $('#nombreUsuario').textContent = usuario;
    $('#avatarInicial').textContent = iniciales(usuario);

    setupCharts();
    const urlSec = new URLSearchParams(location.search).get('seccion');
    const btnInicial = urlSec ? document.querySelector('.nav-item[data-seccion="' + urlSec + '"]') : null;
    if (btnInicial) btnInicial.click();
    else cargarResumen();
  });
})();