const express = require('express');
const { initScheduleManager } = require('./scheduleManager');
const { startEngine, addClient, removeClient } = require('./streamEngine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

app.get('/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Connection': 'keep-alive'
  });
  addClient(res);
  req.on('close', () => removeClient(res));
});

app.listen(PORT, () => {
  initScheduleManager();
  startEngine();
});
