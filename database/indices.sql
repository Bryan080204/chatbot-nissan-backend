USE ChatbotNissanDB;
GO

-- Índices recomendados para soportar alto volumen (miles de usuarios).
-- Son seguros: solo crean el índice si la tabla y la columna existen.

IF OBJECT_ID('Clientes', 'U') IS NOT NULL AND COL_LENGTH('Clientes', 'NumeroTelefono') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Clientes_NumeroTelefono' AND object_id = OBJECT_ID('Clientes'))
        CREATE NONCLUSTERED INDEX IX_Clientes_NumeroTelefono ON Clientes (NumeroTelefono);
END
GO

IF OBJECT_ID('Mensajes', 'U') IS NOT NULL AND COL_LENGTH('Mensajes', 'IdCliente') IS NOT NULL AND COL_LENGTH('Mensajes', 'Fecha') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Mensajes_IdCliente_Fecha' AND object_id = OBJECT_ID('Mensajes'))
        CREATE NONCLUSTERED INDEX IX_Mensajes_IdCliente_Fecha ON Mensajes (IdCliente, Fecha DESC);
END
GO

IF OBJECT_ID('Mensajes', 'U') IS NOT NULL AND COL_LENGTH('Mensajes', 'Fecha') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Mensajes_Fecha' AND object_id = OBJECT_ID('Mensajes'))
        CREATE NONCLUSTERED INDEX IX_Mensajes_Fecha ON Mensajes (Fecha DESC);
END
GO

IF OBJECT_ID('RespuestaBot', 'U') IS NOT NULL AND COL_LENGTH('RespuestaBot', 'IdMensaje') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RespuestaBot_IdMensaje' AND object_id = OBJECT_ID('RespuestaBot'))
        CREATE NONCLUSTERED INDEX IX_RespuestaBot_IdMensaje ON RespuestaBot (IdMensaje);
END
GO

IF OBJECT_ID('Citas', 'U') IS NOT NULL AND COL_LENGTH('Citas', 'IdCliente') IS NOT NULL AND COL_LENGTH('Citas', 'FechaHora') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Citas_IdCliente_FechaHora' AND object_id = OBJECT_ID('Citas'))
        CREATE NONCLUSTERED INDEX IX_Citas_IdCliente_FechaHora ON Citas (IdCliente, FechaHora);
END
GO

IF OBJECT_ID('Citas', 'U') IS NOT NULL AND COL_LENGTH('Citas', 'Estado') IS NOT NULL AND COL_LENGTH('Citas', 'FechaHora') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Citas_Estado_FechaHora' AND object_id = OBJECT_ID('Citas'))
        CREATE NONCLUSTERED INDEX IX_Citas_Estado_FechaHora ON Citas (Estado, FechaHora) INCLUDE (IdCliente, Servicio);
END
GO

IF OBJECT_ID('HistorialConsultasDB', 'U') IS NOT NULL AND COL_LENGTH('HistorialConsultasDB', 'FechaHora') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HistorialConsultasDB_FechaHora' AND object_id = OBJECT_ID('HistorialConsultasDB'))
        CREATE NONCLUSTERED INDEX IX_HistorialConsultasDB_FechaHora ON HistorialConsultasDB (FechaHora DESC);
END
GO