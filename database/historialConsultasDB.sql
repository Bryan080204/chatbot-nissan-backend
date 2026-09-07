USE ChatbotNissanDB;
GO

-- Tabla requerida por el Ing. Peralta: registro de cada consulta ejecutada en SQL Server
-- y de cada prompt enviado a la IA (traza y consumo).
IF OBJECT_ID('HistorialConsultasDB', 'U') IS NULL
BEGIN
    CREATE TABLE HistorialConsultasDB (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        TipoConsulta VARCHAR(50) NOT NULL,
        QueryEjecutado NVARCHAR(MAX) NOT NULL,
        FechaHora DATETIME DEFAULT GETDATE()
    );
END
GO