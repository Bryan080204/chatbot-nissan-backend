const express = require('express');
const { connectDB } = require('./config/database');
const webhookController = require('./controllers/webhookController');

const app = express();
app.use(express.json());

connectDB();

app.get('/webhook', webhookController.verificarWebhook);
app.post('/webhook', webhookController.recibirMensaje);

module.exports = app;