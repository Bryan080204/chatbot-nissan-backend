class Producto {
  constructor({ Categoria, NombreProducto, Descripcion, Precio, Stock } = {}) {
    this.categoria = Categoria;
    this.nombreProducto = NombreProducto;
    this.descripcion = Descripcion;
    this.precio = Precio;
    this.stock = Stock;
  }
}

module.exports = Producto;