const { defineConfig } = require('vite');

const BACKEND = `http://127.0.0.1:${process.env.PORT || 3000}`;

module.exports = defineConfig({
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      '/admin': { target: BACKEND, changeOrigin: true },
      '/webhook': { target: BACKEND, changeOrigin: true },
    },
  },
});