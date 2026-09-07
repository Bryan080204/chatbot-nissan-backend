class Cliente {
  constructor({ NumeroTelefono, Nombre, FechaRegistro } = {}) {
    this.numeroTelefono = NumeroTelefono;
    this.nombre = Nombre;
    this.fechaRegistro = FechaRegistro;
  }
}

module.exports = Cliente;