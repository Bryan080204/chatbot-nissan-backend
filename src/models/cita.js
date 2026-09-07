class Cita {
  constructor({ FechaHora, Servicio, Estado } = {}) {
    this.fechaHora = FechaHora;
    this.servicio = Servicio;
    this.estado = Estado;
  }
}

module.exports = Cita;