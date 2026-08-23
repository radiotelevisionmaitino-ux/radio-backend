const express = require('express');
const { initScheduleManager } = require('./scheduleManager');
const { startEngine, addClient, removeClient } = require('./streamEngine');

const app = express();
const PORT = process.env.PORT || 3000;

// Permitir peticiones desde tu web en GitHub Pages (CORS)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Punto de salida del audio continuo (Stream MP3)
app.get('/live', (req, res) => {
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  addClient(res);

  req.on('close', () => {
    removeClient(res);
  });
});

// Inicializar gestor de datos y motor de audio
app.listen(PORT, () => {
  console.log(`Servidor de Radio Maitino activo en puerto ${PORT}`);
  initScheduleManager();
  startEngine();
});
