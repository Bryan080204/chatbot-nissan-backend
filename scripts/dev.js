require('dotenv').config();
const { spawn } = require('child_process');
const net = require('net');

const PUERTO_BACKEND = Number(process.env.PORT) || 3000;

function puertoEnUso(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
}

(async () => {
  const backendYaEnUso = await puertoEnUso(PUERTO_BACKEND);

  const hijos = [];

  if (backendYaEnUso) {
    console.log(`[dev] Backend ya está corriendo en :${PUERTO_BACKEND}, no lo vuelvo a arrancar.`);
  } else {
    console.log(`[dev] Arrancando backend en :${PUERTO_BACKEND}...`);
    hijos.push(spawn('node', ['server.js'], { stdio: 'inherit' }));
  }

  console.log('[dev] Arrancando panel (Vite)...');
  hijos.push(spawn('node', ['node_modules/vite/bin/vite.js', '--host'], { stdio: 'inherit' }));

  let cerrado = false;
  function finalizar() {
    if (cerrado) return;
    cerrado = true;
    console.log('[dev] Deteniendo procesos...');
    hijos.forEach((hijo) => hijo.kill('SIGTERM'));
    setTimeout(() => process.exit(0), 800);
  }
  process.on('SIGINT', finalizar);
  process.on('SIGTERM', finalizar);

  hijos.forEach((hijo) => {
    hijo.on('exit', (codigo) => {
      console.log(`[dev] Un proceso se detuvo (código ${codigo}), cerrando los demás...`);
      finalizar();
    });
  });
})();