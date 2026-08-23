const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
const { PassThrough } = require('stream');
const { getCurrentTrackInfo } = require('./scheduleManager');

let clients = [];
let burstBuffer = [];
const MAX_BURST_CHUNKS = 25; // Pequeño colchón (~2 seg) para arranque instantáneo en la web

const addClient = (res) => {
  // Envia el colchón inicial para que el reproductor HTML no se quede esperando
  burstBuffer.forEach(chunk => {
    try { res.write(chunk); } catch(e){}
  });
  clients.push(res);
};

const removeClient = (res) => {
  clients = clients.filter(c => c !== res);
};

const broadcast = (chunk) => {
  // Guardar en el colchón para nuevos oyentes
  burstBuffer.push(chunk);
  if (burstBuffer.length > MAX_BURST_CHUNKS) {
    burstBuffer.shift();
  }

  // Transmitir a todos los oyentes conectados en tiempo real
  clients.forEach(res => {
    try {
      res.write(chunk);
    } catch (err) {
      // Cliente desconectado
    }
  });
};

// Canal de audio en crudo (PCM) que se mantiene vivo permanentemente
const pcmPassThrough = new PassThrough();
let currentFeeder = null;

// 1. CODIFICADOR MAESTRO (Trasmite el MP3 final unificado a los oyentes)
function startMasterEncoder() {
  console.log('[MOTOR] Iniciando Codificador Maestro Unificado...');

  const master = ffmpeg(pcmPassThrough)
    .inputFormat('s16le')
    .inputOptions([
      '-ar 44100',
      '-ac 2'
    ])
    .audioCodec('libmp3lame')
    .audioBitrate(96) // 96k: Calidad óptima y ultraligera para Render
    .audioChannels(2)
    .audioFrequency(44100)
    .format('mp3')
    .on('error', (err) => {
      console.error('[ERROR MAESTRO] Fallo en el codificador maestro:', err.message);
      setTimeout(startMasterEncoder, 2000);
    });

  const masterStream = master.pipe();
  masterStream.on('data', broadcast);
}

// 2. ALIMENTADOR (Tritura cualquier formato MP3/WebM/MP4 a audio PCM)
function playNextTrack() {
  if (currentFeeder) {
    try { currentFeeder.kill('SIGKILL'); } catch (e) {}
    currentFeeder = null;
  }

  const track = getCurrentTrackInfo();
  console.log(`[EN ANTENA] ${track.title} | Posición actual: ${Math.floor(track.seekPos)}s`);

  const feeder = ffmpeg(track.src)
    .inputOptions([
      '-reconnect 1',
      '-reconnect_streamed 1',
      '-reconnect_delay_max 5',
      '-analyzeduration 2000000',
      '-probesize 2000000'
    ]);

  // Si la parrilla indica que la canción debe empezar en un segundo específico
  if (track.seekPos && track.seekPos > 3) {
    feeder.seekInput(Math.floor(track.seekPos));
  }

  feeder
    .audioCodec('pcm_s16le')
    .audioChannels(2)
    .audioFrequency(44100)
    .format('s16le')
    .on('error', (err) => {
      console.error(`[ERROR PISTA] No se pudo reproducir ${track.title} (${err.message}). Saltando...`);
      setTimeout(playNextTrack, 1000);
    })
    .on('end', () => {
      console.log(`[FIN PISTA] ${track.title}`);
      playNextTrack();
    });

  currentFeeder = feeder;
  
  // ¡CLAVE ABSOLUTA! { end: false } evita que el canal maestro se cierre al terminar la pista
  feeder.pipe(pcmPassThrough, { end: false });
}

function startEngine() {
  startMasterEncoder();
  setTimeout(playNextTrack, 1000);
}

module.exports = { startEngine, addClient, removeClient };
