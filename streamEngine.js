const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
const { getNextTrackToPlay } = require('./scheduleManager');

let clients = [];
const addClient = (res) => clients.push(res);
const removeClient = (res) => clients = clients.filter(c => c !== res);
const broadcast = (chunk) => clients.forEach(c => c.write(chunk));

function processNextAudio() {
  const track = getNextTrackToPlay();
  console.log(`[EN ANTENA] ${track.title} | ${track.src}`);

  const command = ffmpeg(track.src)
    .inputOptions([
      '-re',                        // Fuerza reproducción a velocidad real
      '-analyzeduration 1000000',   // Evita que FFmpeg se bloquee analizando MPG/WEBM largos
      '-probesize 1000000',
      '-reconnect 1', 
      '-reconnect_streamed 1', 
      '-reconnect_delay_max 5'
    ])
    .audioCodec('libmp3lame')
    .audioBitrate(96)               // Calidad óptima y ligera para servidores gratuitos
    .audioChannels(2)
    .audioFrequency(44100)
    .format('mp3')
    .on('error', (err) => {
      console.error('Error en pista (saltando al siguiente):', err.message);
      setTimeout(processNextAudio, 1000);
    })
    .on('end', () => processNextAudio());

  command.pipe().on('data', broadcast);
}

function startEngine() {
  setTimeout(processNextAudio, 2000);
}

module.exports = { startEngine, addClient, removeClient };
