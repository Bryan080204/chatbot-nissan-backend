class HistorialConsulta {
  constructor({ Id, TipoConsulta, QueryEjecutado, FechaHora } = {}) {
    this.id = Id;
    this.tipoConsulta = TipoConsulta;
    this.queryEjecutado = QueryEjecutado;
    this.fechaHora = FechaHora;
  }
}

module.exports = HistorialConsulta;