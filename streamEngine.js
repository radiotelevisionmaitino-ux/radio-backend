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

// Tubería global con límite de escuchadores desactivado para evitar el Warning
const pcmPassThrough = new PassThrough();
pcmPassThrough.setMaxListeners(0);

let currentFeeder = null;
let trackTimeout = null;
const failedTracks = new Set(); 

const SILENCE_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABpRDIzIHYyLjMuMCBhbmQgaWQzIHYyLjQuMCB0YWdzAAAAAAAAAAAA//MkxAAKAAAABpAAAAWSAAAAASU1BTUUzLjk5LjVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

function startMasterEncoder() {
  ffmpeg(pcmPassThrough)
    .inputFormat('s16le')
    .inputOptions(['-ar 44100', '-ac 2'])
    .audioCodec('libmp3lame')
    .audioBitrate(96)
    .audioChannels(2)
    .audioFrequency(44100)
    .format('mp3')
    .on('error', () => setTimeout(startMasterEncoder, 2000))
    .pipe()
    .on('data', broadcast);
}

function playNextTrack(forceFallback = false) {
  if (trackTimeout) clearTimeout(trackTimeout);

  if (currentFeeder) {
    try {
      currentFeeder.unpipe(pcmPassThrough);
      currentFeeder.removeAllListeners();
      currentFeeder.kill('SIGKILL');
    } catch (e) {}
    currentFeeder = null;
  }

  let track = getCurrentTrackInfo();

  // Si la pista falló previamente o forzamos salto, usamos silencio temporal
  if (forceFallback || (track.src && failedTracks.has(track.src))) {
    console.log(`[SALTO AUTOMÁTICO] ${track.title} no disponible. Pasando a emisión de respaldo...`);
    track = {
      src: SILENCE_MP3,
      title: "Transición de Seguridad",
      remaining: 5,
      seekPos: 0
    };
  }

  const safeRemaining = Math.max(3, track.remaining);

  if (!track.src || track.src.trim() === "" || track.src === "null") {
    trackTimeout = setTimeout(() => playNextTrack(true), 2000);
    return;
  }

  currentFeeder = ffmpeg(track.src)
    .inputOptions([
      '-reconnect 1',
      '-reconnect_streamed 1',
      '-reconnect_delay_max 5',
      '-analyzeduration 1000000',
      '-probesize 1000000'
    ])
    .audioCodec('pcm_s16le')
    .audioChannels(2)
    .audioFrequency(44100)
    .format('s16le');

  if (track.seekPos && track.seekPos > 3 && !track.src.startsWith('data:')) {
    currentFeeder.seekInput(Math.floor(track.seekPos));
  }

  currentFeeder.on('error', (err) => {
    console.error(`[ERROR AUDIO] Imposible reproducir URL de: ${track.title}`);
    if (track.src && !track.src.startsWith('data:')) {
      failedTracks.add(track.src);
      setTimeout(() => failedTracks.delete(track.src), 180000); // Reintenta tras 3 min
    }

    if (trackTimeout) clearTimeout(trackTimeout);
    // En lugar de reintentar la misma pista rota, fuerza el salto
    trackTimeout = setTimeout(() => playNextTrack(true), 1000);
  });

  currentFeeder.pipe(pcmPassThrough, { end: false });

  trackTimeout = setTimeout(() => {
    playNextTrack(false);
  }, safeRemaining * 1000);
}

function startEngine() {
  startMasterEncoder();
  setTimeout(() => playNextTrack(false), 1000);
}

module.exports = { startEngine, addClient, removeClient };
