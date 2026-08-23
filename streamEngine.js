const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
const { PassThrough } = require('stream');
const { getCurrentTrackInfo } = require('./scheduleManager');

let clients = [];
let burstBuffer = [];

const addClient = (res) => {
  burstBuffer.forEach(chunk => { try { res.write(chunk); } catch(e){} });
  clients.push(res);
};

const removeClient = (res) => {
  clients = clients.filter(c => c !== res);
};

const broadcast = (chunk) => {
  burstBuffer.push(chunk);
  if (burstBuffer.length > 25) burstBuffer.shift();
  clients.forEach(res => { try { res.write(chunk); } catch (err) {} });
};

// Tubería global PCM con límite de eventos desactivado para prevenir fugas de RAM
const pcmPassThrough = new PassThrough();
pcmPassThrough.setMaxListeners(0);

let currentFeeder = null;
let trackTimeout = null;
const failedTracks = new Set();

// CODIFICADOR MASTER (Salida continua a MP3)
function startMasterEncoder() {
  ffmpeg(pcmPassThrough)
    .inputFormat('s16le')
    .inputOptions(['-ar 44100', '-ac 2'])
    .audioCodec('libmp3lame')
    .audioBitrate(128)
    .audioChannels(2)
    .audioFrequency(44100)
    .format('mp3')
    .on('error', (err) => {
      console.error("[MASTER ENCODER ERROR]", err.message);
      setTimeout(startMasterEncoder, 2000);
    })
    .pipe()
    .on('data', broadcast);
}

// GENERADOR DE SILENCIO NATIVO (Puente de seguridad si falla una URL)
function playSilence(duration = 5) {
  if (trackTimeout) clearTimeout(trackTimeout);
  if (currentFeeder) {
    try {
      currentFeeder.unpipe(pcmPassThrough);
      currentFeeder.removeAllListeners();
      currentFeeder.kill('SIGKILL');
    } catch (e) {}
    currentFeeder = null;
  }

  currentFeeder = ffmpeg('anullsrc=r=44100:cl=stereo')
    .inputFormat('lavfi')
    .duration(duration)
    .audioCodec('pcm_s16le')
    .audioChannels(2)
    .audioFrequency(44100)
    .format('s16le');

  currentFeeder.on('error', () => {
    trackTimeout = setTimeout(playNextTrack, 2000);
  });

  currentFeeder.pipe(pcmPassThrough, { end: false });
  trackTimeout = setTimeout(playNextTrack, duration * 1000);
}

// LECTOR Y REPRODUCTOR DE PISTAS DE LA PARRILLA
function playNextTrack() {
  if (trackTimeout) clearTimeout(trackTimeout);

  if (currentFeeder) {
    try {
      currentFeeder.unpipe(pcmPassThrough);
      currentFeeder.removeAllListeners();
      currentFeeder.kill('SIGKILL');
    } catch (e) {}
    currentFeeder = null;
  }

  const track = getCurrentTrackInfo();

  // Si la ruta está vacía o falló previamente, genera silencio sin tirar el servidor
  if (!track || !track.src || track.src.trim() === "" || failedTracks.has(track.src)) {
    console.log(`[PUENTE DE SEGURIDAD] Pista inaccesible o vacía. Emitiendo silencio técnico...`);
    return playSilence(5);
  }

  console.log(`[AL AIRE] ${track.title} | Posición: ${Math.floor(track.seekPos)}s | Restante: ${track.remaining}s`);

  currentFeeder = ffmpeg(track.src)
    .inputOptions([
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-reconnect 1',
      '-reconnect_streamed 1',
      '-reconnect_delay_max 5',
      '-analyzeduration 5000000',
      '-probesize 5000000'
    ])
    .audioCodec('pcm_s16le')
    .audioChannels(2)
    .audioFrequency(44100)
    .format('s16le');

  if (track.seekPos && track.seekPos > 3) {
    currentFeeder.seekInput(Math.floor(track.seekPos));
  }

  currentFeeder.on('error', (err) => {
    console.error(`[ERROR DE RED] Imposible reproducir: ${track.title}`);
    if (track.src) {
      failedTracks.add(track.src);
      setTimeout(() => failedTracks.delete(track.src), 180000); // Reintenta tras 3 minutos
    }
    playSilence(5);
  });

  currentFeeder.pipe(pcmPassThrough, { end: false });

  trackTimeout = setTimeout(() => {
    playNextTrack();
  }, Math.max(3, track.remaining) * 1000);
}

function startEngine() {
  startMasterEncoder();
  setTimeout(playNextTrack, 2000);
}

module.exports = { startEngine, addClient, removeClient };
