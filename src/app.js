const path = require('path');
const express = require('express');
const { connectDB } = require('./config/database');
const webhookController = require('./controllers/webhookController');
const adminController = require('./controllers/adminController');

const app = express();
app.use(express.json());

connectDB();

app.get('/webhook', webhookController.verificarWebhook);
app.post('/webhook', webhookController.recibirWebhook);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', adminController.router);

module.exports = app;