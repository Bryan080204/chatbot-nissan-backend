class Mensaje {
    constructor({ Id, NumeroTelefono, TextoMensaje, Fecha, jsonwebhook } = {}) {
        this.id = Id;
        this.numeroTelefono = NumeroTelefono;
        this.textoMensaje = TextoMensaje;
        this.jsonwebhook = jsonwebhook;
        this.fecha = Fecha;
    }
}

module.exports = Mensaje;