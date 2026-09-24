const LIMITE_CONCURRENCIA = Number(process.env.COLA_CONCURRENCIA) || 20;
const MAX_COLA = Number(process.env.COLA_MAX) || 10000;

let cola = [];
const despertadores = [];

function despertarUno() {
  const cb = despertadores.shift();
  if (cb) cb();
}

function encolar(fn) {
  if (cola.length >= MAX_COLA) {
    console.error("Cola de mensajes llena, se descarta la tarea más reciente");
    return false;
  }
  cola.push(fn);
  despertarUno();
  return true;
}

for (let i = 0; i < LIMITE_CONCURRENCIA; i++) {
  (async function trabajador() {
    for (;;) {
      const tarea = cola.shift();
      if (!tarea) {
        await new Promise((resolve) => despertadores.push(resolve));
        continue;
      }
      try {
        await tarea();
      } catch (err) {
        console.error("Error procesando tarea de la cola:", err.message);
      }
    }
  })();
}

module.exports = { encolar };