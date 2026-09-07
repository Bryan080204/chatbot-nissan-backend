class Mensaje {
  constructor({ Id, NumeroTelefono, MensajeUsuario, RespuestaBot, Fecha } = {}) {
    this.id = Id;
    this.numeroTelefono = NumeroTelefono;
    this.mensajeUsuario = MensajeUsuario;
    this.respuestaBot = RespuestaBot;
    this.fecha = Fecha;
  }
}

module.exports = Mensaje;