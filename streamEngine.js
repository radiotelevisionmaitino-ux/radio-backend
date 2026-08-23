const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
const { getNextTrackToPlay } = require('./scheduleManager');

let clients = [];
const addClient = (res) => clients.push(res);
const removeClient = (res) => clients = clients.filter(c => c !== res);
const broadcast = (chunk) => clients.forEach(c => c.write(chunk));

function processNextAudio() {
  const track = getNextTrackToPlay();
  console.log(`[AL AIRE] ${track.title} | ${track.src}`);

  const command = ffmpeg(track.src)
    .inputOptions([
      '-re', // CRÍTICO: Lee en tiempo real para no ahogar la RAM con .webm
      '-reconnect 1', 
      '-reconnect_streamed 1', 
      '-reconnect_delay_max 5'
    ])
    .audioCodec('libmp3lame')
    .audioBitrate(96) // Más ligero para servidores gratuitos
    .audioChannels(2)
    .audioFrequency(44100)
    .format('mp3')
    .on('error', (err) => {
      console.error('Error FFmpeg (Saltando):', err.message);
      setTimeout(processNextAudio, 2000);
    })
    .on('end', () => processNextAudio());

  command.pipe().on('data', broadcast);
}

function startEngine() {
  setTimeout(processNextAudio, 3000);
}

module.exports = { startEngine, addClient, removeClient };
