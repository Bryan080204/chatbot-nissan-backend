const sql = require('mssql');

const dbConfig = {
    server: process.env.DB_SERVER || '127.0.0.1',
    database: process.env.DB_NAME || 'ChatbotNissanDB',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const connectDB = async () => {
    try {
        await sql.connect(dbConfig);
        console.log("-> Conexión exitosa a SQL Server (ChatbotNissanDB)");
    } catch (err) {
        console.error("Error conectando a SQL Server:", err.message);
    }
};

module.exports = { sql, connectDB, dbConfig };