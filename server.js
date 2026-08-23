const express = require('express');
const { initScheduleManager } = require('./scheduleManager');
const { startEngine, addClient, removeClient } = { ...require('./streamEngine') };

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de cabeceras CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Ruta raíz para pings de diagnóstico o Keep-Alive (Cron-job.org)
app.get('/', (req, res) => {
  res.send('Radio Maitino 24/7 - Servidor Backend Activo');
});

// Emisión en directo para la Web o reproductores externos
app.get('/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  addClient(res);

  req.on('close', () => {
    removeClient(res);
  });
});

app.listen(PORT, () => {
  console.log(`[SERVIDOR] Radio Maitino en marcha en el puerto ${PORT}`);
  initScheduleManager();
  startEngine();
});
