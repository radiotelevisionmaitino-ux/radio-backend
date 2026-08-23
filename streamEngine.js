const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
const { PassThrough } = require('stream');
const { getCurrentTrackInfo } = require('./scheduleManager');

let clients = [];
let burstBuffer = [];

const addClient = (res) => { burstBuffer.forEach(chunk => { try { res.write(chunk); } catch(e){} }); clients.push(res); };
const removeClient = (res) => { clients = clients.filter(c => c !== res); };

const broadcast = (chunk) => {
    burstBuffer.push(chunk); if (burstBuffer.length > 25) burstBuffer.shift();
    clients.forEach(res => { try { res.write(chunk); } catch (err) {} });
};

const pcmPassThrough = new PassThrough();
let currentFeeder = null;
let trackTimeout = null;

// CODIFICADOR UNIVERSAL: Todo lo que entra se convierte al instante a MP3
function startMasterEncoder() {
    ffmpeg(pcmPassThrough).inputFormat('s16le').inputOptions(['-ar 44100', '-ac 2'])
        .audioCodec('libmp3lame').audioBitrate(128).audioChannels(2).audioFrequency(44100).format('mp3')
        .on('error', (err) => { setTimeout(startMasterEncoder, 2000); })
        .pipe().on('data', broadcast);
}

function playNextTrack() {
    if (currentFeeder) { try { currentFeeder.kill('SIGKILL'); } catch (e) {} }
    clearTimeout(trackTimeout);

    const track = getCurrentTrackInfo();
    console.log(`[AL AIRE] ${track.title} | Segundo: ${Math.floor(track.seekPos)} | Faltan: ${track.remaining}s`);

    // CONVERSOR AL VUELO: Transforma MP4, WebM, MP3 o streams online
    currentFeeder = ffmpeg(track.src)
        .inputOptions(['-reconnect 1', '-reconnect_streamed 1', '-reconnect_delay_max 5'])
        .audioCodec('pcm_s16le').audioChannels(2).audioFrequency(44100).format('s16le');

    if (track.seekPos > 2) currentFeeder.seekInput(Math.floor(track.seekPos));

    currentFeeder.on('error', (err) => {
        console.error(`[SALTADO] ${track.title} no está disponible online.`);
        setTimeout(playNextTrack, 2000); // Si falla (ej. link caído), salta a los 2s
    });

    currentFeeder.pipe(pcmPassThrough, { end: false });

    // En lugar de esperar al 'end' del archivo (que suele fallar con audios online infinitos),
    // forzamos el cambio de canción usando el tiempo restante calculado por el Cerebro.
    trackTimeout = setTimeout(() => {
        playNextTrack();
    }, (track.remaining * 1000)); 
}

function startEngine() { startMasterEncoder(); setTimeout(playNextTrack, 2000); }
module.exports = { startEngine, addClient, removeClient };
