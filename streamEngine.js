const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

const { getNextTrackToPlay } = require('./scheduleManager');

let clients = [];

function addClient(res) {
  clients.push(res);
}

function removeClient(res) {
  clients = clients.filter(client => client !== res);
}

function broadcastData(chunk) {
  clients.forEach(client => client.write(chunk));
}

function processNextAudio() {
  const track = getNextTrackToPlay();
  console.log(`[AL AIRE] Sonando: ${track.title} - ${track.src}`);

  // FFmpeg procesa el archivo fuente al vuelo
  const command = ffmpeg(track.src)
    .audioCodec('libmp3lame')
    .audioBitrate(128)
    .audioChannels(2)
    .audioFrequency(44100)
    .format('mp3')
    .on('error', (err) => {
      console.error('Error FFmpeg (Saltando pista):', err.message);
      // Si un enlace MP3 está roto, espera 2 segundos y salta al siguiente
      setTimeout(processNextAudio, 2000);
    })
    .on('end', () => {
      // Cuando termina la canción, arranca la siguiente en bucle infinito
      processNextAudio();
    });

  const stream = command.pipe();
  
  stream.on('data', (chunk) => {
    broadcastData(chunk);
  });
}

function startEngine() {
  console.log("Motor FFmpeg inicializado. Comenzando flujo...");
  // Damos 3 segundos de margen para que la primera llamada a Google Sheets termine
  setTimeout(processNextAudio, 3000);
}

module.exports = { startEngine, addClient, removeClient };
