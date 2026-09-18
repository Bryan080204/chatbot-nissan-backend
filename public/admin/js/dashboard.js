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
    historial: ['Historial IA', 'Prompts enviados y consultas ejecutadas'],
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

  async function cargarResumen() {
    const btn = $('#btnRefrescar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    try {
      datosResumen = await api('/admin/api/stats');
      pintarKPIs(datosResumen.kpis);
      pintarGraficas(datosResumen);
      pintarActividad(datosResumen.ultimasActividades, datosResumen.proximasCitas, datosResumen.topClientes);
    } catch (e) {
      mostrarVacio('#actividadReciente', e.message);
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
    ];
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
      const totalMensajes = clientes.reduce((a, c) => a + (c.totalMensajes || 0), 0);

      $('#kpisClientes').innerHTML = [
        kpiCard({ icono: 'fa-users', label: 'Total clientes', valor: fmtNum(clientes.length), color: '#1e3a8a', fondo: '#eff6ff' }),
        kpiCard({ icono: 'fa-comment-dots', label: 'Mensajes enviados', valor: fmtNum(totalMensajes), color: '#c3002f', fondo: '#fff1f4' }),
      ];

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
      const confirmadas = citas.filter((c) => (c.Estado || '').toLowerCase().includes('confirm')).length;
      const proximas = citas.filter((c) => (c.Estado || '').toLowerCase().includes('confirm') && new Date(c.FechaHora) >= new Date()).length;

      $('#kpisCitas').innerHTML = [
        kpiCard({ icono: 'fa-calendar-check', label: 'Total citas', valor: fmtNum(citas.length), color: '#16a34a', fondo: '#f0fdf4' }),
        kpiCard({ icono: 'fa-circle-check', label: 'Confirmadas', valor: fmtNum(confirmadas), color: '#1e3a8a', fondo: '#eff6ff' }),
        kpiCard({ icono: 'fa-hourglass-half', label: 'Próximas', valor: fmtNum(proximas), color: '#7c3aed', fondo: '#f5f3ff' }),
      ];

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
    try {
      const convs = await api('/admin/api/conversaciones');
      const lista = $('#listaConversaciones');
      if (!convs.length) {
        lista.innerHTML = `<div class="panel vacio">${vacioIcono()}Sin conversaciones todavía.</div>`;
        return;
      }
      lista.innerHTML = convs.map((c) => `
        <div class="conv-item">
          <div class="conv-cabecera">
            <div class="conv-cliente">
              <div class="mini-avatar" style="width:34px;height:34px;border-radius:50%;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">${iniciales(c.Nombre)}</div>
              <div><b>${esc(c.Nombre)}</b><br><span>${esc(c.NumeroTelefono)}</span></div>
            </div>
            <span class="conv-hora">${fmtFechaHora(c.Fecha)}</span>
          </div>
          <div class="burbuja cliente">
            <div class="b-avatar"><i class="fas fa-user"></i></div>
            <div class="b-contenido">${esc(c.TextoMensaje)}<small>${fmtHora(c.Fecha)}</small></div>
          </div>
          <div class="burbuja bot">
            <div class="b-avatar"><i class="fas fa-robot"></i></div>
            <div class="b-contenido">${c.TextoRespuesta ? esc(c.TextoRespuesta) : '<div class="b-label">Sin respuesta registrada</div>'}<small>${c.FechaRespuesta ? fmtFechaHora(c.FechaRespuesta) : '—'}</small></div>
          </div>
        </div>`).join('');
    } catch (e) {
      $('#listaConversaciones').innerHTML = `<div class="panel vacio">${vacioIcono()}${esc(e.message)}</div>`;
    }
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

  /* ================= HISTORIAL ================= */
  async function cargarHistorial() {
    try {
      const registros = await api('/admin/api/historial');
      const cuerpo = $('#tablaHistorial tbody');
      if (!registros.length) {
        cuerpo.innerHTML = `<tr><td colspan="4"><div class="vacio">${vacioIcono()}No hay registros aún. La tabla se activa cuando el bot consulta la BD.</div></td></tr>`;
        return;
      }
      cuerpo.innerHTML = registros.map((r) => {
        const tipo = (r.TipoConsulta || '').toLowerCase();
        let clase = 'cat';
        if (tipo.startsWith('ia_')) clase = 'ia';
        else if (tipo.includes('cita')) clase = 'cita';
        return `
          <tr>
            <td><span class="numero">#${r.Id}</span></td>
            <td><span class="badge-tipo ${clase}">${esc(r.TipoConsulta)}</span></td>
            <td class="query-celda"><code title="${esc(r.QueryEjecutado)}">${esc(r.QueryEjecutado)}</code></td>
            <td>${fmtFechaHora(r.FechaHora)}</td>
          </tr>`;
      }).join('');
    } catch (e) {
      $('#tablaHistorial tbody').innerHTML = `<tr><td colspan="4"><div class="vacio">${vacioIcono()}${esc(e.message)}</div></td></tr>`;
    }
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
    cargarResumen();
  });
})();