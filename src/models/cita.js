class Cita {
  constructor({ Id, IdCliente, FechaHora, Servicio, Estado } = {}) {
    this.id = Id;
    this.idCliente = IdCliente;
    this.fechaHora = FechaHora;
    this.servicio = Servicio;
    this.estado = Estado;
  }
}

module.exports = Cita;