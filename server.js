const express = require('express');
const { initScheduleManager } = require('./scheduleManager');
const { startEngine, addClient, removeClient } = require('./streamEngine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET");
  next();
});

app.get('/', (req, res) => {
  res.send('Servidor de Radio Maitino Activo. Escucha en /live');
});

app.get('/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff'
  });
  
  addClient(res);
  req.on('close', () => removeClient(res));
});

app.listen(PORT, () => {
  console.log(`[SERVIDOR] Iniciado en el puerto ${PORT}`);
  initScheduleManager();
  startEngine();
});
