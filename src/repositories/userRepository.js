const { sql, obtenerRequest } = require('../config/database');
const Cliente = require('../models/cliente');

const registrarClienteSiNuevo = async (numeroTelefono) => {
  const request = await obtenerRequest();
  await request.input('numero', sql.VarChar(15), numeroTelefono)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM Clientes WHERE NumeroTelefono = @numero)
      BEGIN
        INSERT INTO Clientes (NumeroTelefono) VALUES (@numero)
      END
    `);
};

const obtenerClientePorNumero = async (numeroTelefono) => {
  const request = await obtenerRequest();
  const result = await request.input('numero', sql.VarChar(15), numeroTelefono)
    .query('SELECT TOP 1 NumeroTelefono, Nombre, FechaRegistro FROM Clientes WHERE NumeroTelefono = @numero');
  return result.recordset.length > 0 ? new Cliente(result.recordset[0]) : null;
};

module.exports = { registrarClienteSiNuevo, obtenerClientePorNumero };