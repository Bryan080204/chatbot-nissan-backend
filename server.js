require('dotenv').config();

process.on('unhandledRejection', (razon) => {
  console.error('UnhandledRejection no controlado:', razon);
});

process.on('uncaughtException', (err) => {
  console.error('Excepción no controlada:', err.message);
});

const app = require('./src/app');
const { flushConsultasDB } = require('./src/repositories/sqlQueryRepository');
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT} (Nissan Bot Activo)`);
});

const apagar = (senial) => {
  console.log(`\nRecibida señal ${senial}, cerrando servidor...`);
  server.close(async () => {
    try {
      await flushConsultasDB();
    } catch (err) {
      console.error('Error al vaciar historial en el cierre:', err.message);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
};

['SIGINT', 'SIGTERM'].forEach((senial) => process.once(senial, () => apagar(senial)));