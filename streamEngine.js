const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
const { PassThrough } = require('stream');
const { getCurrentTrackInfo } = require('./scheduleManager');

let clients = [];
let burstBuffer = [];

const addClient = (res) => { burstBuffer.forEach(chunk => { try { res.write(chunk); } catch(e){} }); clients.push(res); };
const removeClient = (res) => { clients = clients.filter(c => c !== res); };

const broadcast = (chunk) => {
  burstBuffer.push(chunk);
  if (burstBuffer.length > 25) burstBuffer.shift();
  clients.forEach(res => { try { res.write(chunk); } catch (err) {} });
};

const pcmPassThrough = new PassThrough();
let currentFeeder = null;
let trackTimeout = null;

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

function playNextTrack() {
  if (trackTimeout) clearTimeout(trackTimeout);
  if (currentFeeder) { try { currentFeeder.kill('SIGKILL'); } catch (e) {} }

  const track = getCurrentTrackInfo();
  const safeRemaining = Math.max(3, track.remaining);

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
    if (trackTimeout) clearTimeout(trackTimeout);
    trackTimeout = setTimeout(playNextTrack, 2000);
  });

  currentFeeder.pipe(pcmPassThrough, { end: false });

  trackTimeout = setTimeout(() => {
    playNextTrack();
  }, safeRemaining * 1000);
}

function startEngine() {
  startMasterEncoder();
  setTimeout(playNextTrack, 1000);
}

module.exports = { startEngine, addClient, removeClient };
