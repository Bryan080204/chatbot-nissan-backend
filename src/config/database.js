const sql = require('mssql');

const dbConfig = {
    server: process.env.DB_SERVER || '127.0.0.1',
    database: process.env.DB_NAME || 'ChatbotNissanDB',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    pool: {
        max: Number(process.env.DB_POOL_MAX) || 25,
        min: Number(process.env.DB_POOL_MIN) || 2,
        idleTimeoutMillis: 30000
    },
    connectionTimeout: Number(process.env.DB_CONNECTION_TIMEOUT) || 15000,
    requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT) || 20000
};

let pool = null;
let conectando = null;

const obtenerPool = async () => {
    if (pool && pool.connected) return pool;

    if (!conectando) {
        conectando = (async () => {
            pool = new sql.ConnectionPool(dbConfig);
            pool.on('error', (err) => {
                console.error("Fallo en el pool de SQL Server:", err.message);
                pool = null;
            });
            await pool.connect();
            console.log("-> Conexión exitosa a SQL Server (ChatbotNissanDB)");
            return pool;
        })();
    }

    try {
        return await conectando;
    } catch (err) {
        conectando = null;
        throw err;
    }
};

const obtenerRequest = async () => (await obtenerPool()).request();

const connectDB = async () => {
    try {
        await obtenerPool();
    } catch (err) {
        console.error("Error conectando a SQL Server:", err.message);
        setTimeout(connectDB, 5000);
    }
};

module.exports = { sql, connectDB, obtenerPool, obtenerRequest, dbConfig };