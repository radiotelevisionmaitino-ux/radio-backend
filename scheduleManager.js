const CONFIG = {
  api: "https://script.google.com/macros/s/AKfycbzoQfFFkwSOoZlnX73FKn8lEtbcRSEe6CYXPeuZ6tZPG5OsBuXivvvGtBJhGJhPC7GU/exec",
  pollInterval: 90
};

let library = { news: null, news30: null, chimes: null, weather: null, hours: {}, breaking: null, ads: [], jingles: [], spaces: [], promos: [], filler: [], schedule: {0:[],1:[],2:[],3:[],4:[],5:[],6:[]} };

function getSpainTime() {
  let now = new Date();
  let pts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(now);
  let v = {}; pts.forEach(p => v[p.type] = p.value);
  return new Date(v.year, v.month - 1, v.day, (v.hour === "24" ? 0 : v.hour), v.minute, v.second, now.getMilliseconds());
}

function fixArchiveUrl(url) {
  if (!url) return "";
  let cleanUrl = url.trim();
  // Transforma enlaces de página de Archive.org a descargas directas
  if (cleanUrl.includes('archive.org/details/')) {
    cleanUrl = cleanUrl.replace('archive.org/details/', 'archive.org/download/');
  }
  return cleanUrl;
}

function addToSchedule(item) {
  let days = [];
  let s1 = String(item.dayRaw || "").trim();
  let exactDay = (s1 && s1.toLowerCase() !== "null");
  if (exactDay) {
    s1.split(/[,|]/).forEach(p => { 
      p = p.trim();
      if (p.includes('-')) { 
        let l = p.split('-'); 
        for (let i = parseInt(l[0]); i <= parseInt(l[1]); i++) days.push(i); 
      } else if (p !== "") { days.push(parseInt(p)); } 
    });
  }
  if (days.length === 0) days = [0, 1, 2, 3, 4, 5, 6]; 
  
  let s2 = String(item.hourRaw || "").trim();
  let startSecs = -1;
  let m = s2.match(/^(\d{1,2}):(\d{2})/);
  if (m) startSecs = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60;
  
  if (startSecs !== -1) {
    [...new Set(days)].forEach(d => {
      if (library.schedule[d]) library.schedule[d].push({ ...item, startSecs, exactDay });
    });
  }
}

async function fetchSheetData() {
  try {
    const res = await fetch(CONFIG.api, { redirect: 'follow' });
    const data = await res.json();
    if (!Array.isArray(data)) return;

    library = { news: null, news30: null, chimes: null, weather: null, hours: {}, breaking: null, ads: [], jingles: [], spaces: [], promos: [], filler: [], schedule: {0:[],1:[],2:[],3:[],4:[],5:[],6:[]} };
    let now = getSpainTime();
    let dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

    data.forEach(row => {
      if (!row.type || String(row.type).trim() === "") return;
      
      // Aplicamos el reparador de URLs de Internet Archive
      let rawSrc = fixArchiveUrl(String(row.src || ""));
      let finalSrc = rawSrc;

      // Rotación diaria si hay múltiples enlaces separados por "|"
      if (rawSrc.includes('|')) {
        let audioList = rawSrc.split('|').map(u => u.trim()).filter(u => u.length > 0);
        if (audioList.length > 0) finalSrc = audioList[dayOfYear % audioList.length];
      }

      let item = { 
        src: finalSrc, title: row.title || "Emisión", dur: parseInt(row.duration) || 300, 
        type: row.type.toLowerCase().replace(/\s+/g, ''), dayRaw: row.day, hourRaw: row.hour 
      };
      let t = item.type;

      if (t === 'news') library.news = item; 
      else if (t === 'news30') library.news30 = item; 
      else if (t === 'weather') library.weather = item;
      else if (t === 'chimes') library.chimes = item;
      else if (t === 'space' && !item.hourRaw) library.spaces.push(item);
      else if (t === 'hour') {
        let m = String(item.hourRaw || "").match(/^(\d{1,2}):(\d{2})/);
        if (m) library.hours[parseInt(m[1], 10)] = item; else library.hours['default'] = item;
      } 
      else if (['breaking', 'breakinglive', 'estudiolive', 'emergency'].includes(t)) library.breaking = item;
      else if (t === 'jingle') library.jingles.push(item); 
      else if (t === 'ad') library.ads.push(item);
      else if (t === 'promo') library.promos.push(item);
      else if (['schedule', 'podcast', 'interview', 'sports'].includes(t)) addToSchedule(item);
      else library.filler.push(item);
    });
    console.log("[DATA] Parrilla sincronizada desde el Excel.");
  } catch (e) { console.error("[ERROR EXCEL]", e.message); }
}

function getGlobalFiller(secInDay) {
  let seq = [];
  library.filler.forEach((f, idx) => {
    seq.push(f);
    if (library.jingles.length > 0 && idx % 2 === 0) seq.push(library.jingles[idx % library.jingles.length]);
    if (library.spaces.length > 0 && idx % 4 === 0) seq.push(library.spaces[idx % library.spaces.length]);
  });
  
  if (seq.length === 0) return { src: "", title: "Esperando contenido...", seekPos: 0, remaining: 10 };
  
  let total = seq.reduce((a, b) => a + Math.max(1, b.dur), 0);
  let c = secInDay % (total || 1);
  for (let itm of seq) {
    let idur = Math.max(1, itm.dur);
    if (c < idur) return { ...itm, seekPos: c, remaining: idur - c };
    c -= idur;
  }
  return { ...seq[0], seekPos: 0, remaining: seq[0].dur };
}

function getCurrentTrackInfo() {
  const now = getSpainTime();
  const d = now.getDay(), h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const secInDay = h * 3600 + m * 60 + s, secInHour = m * 60 + s;

  // Bloque :00
  let tohSeq = [];
  if (h === 0 && library.chimes) tohSeq.push(library.chimes);
  else if (library.hours[h] || library.hours['default']) tohSeq.push(library.hours[h] || library.hours['default']);
  if (library.news) tohSeq.push(library.news);
  if (library.weather) tohSeq.push(library.weather);
  let blockDur00 = tohSeq.reduce((a, b) => a + Math.max(1, b.dur), 0);

  // Bloque :30
  let toh30Seq = [];
  if (library.news30) toh30Seq.push(library.news30);
  if (library.weather) toh30Seq.push(library.weather);
  let blockDur30 = toh30Seq.reduce((a, b) => a + Math.max(1, b.dur), 0);

  // Programación
  let showsToday = library.schedule[d] || [];
  let activeShows = showsToday.filter(sh => secInDay >= sh.startSecs && secInDay < sh.startSecs + sh.dur);
  activeShows.sort((a, b) => (b.exactDay === a.exactDay ? (a.startSecs - b.startSecs) : (b.exactDay ? 1 : -1)));
  let scheduledShow = activeShows[0];

  // 1. Directo Prioritario
  if (library.breaking) return { ...library.breaking, seekPos: 0, remaining: Math.max(1, library.breaking.dur) };
  
  // 2. Bloque de las en punto (:00)
  if (secInHour < blockDur00 && (!scheduledShow || scheduledShow.startSecs % 3600 === 0)) {
    let c = secInHour;
    for (let itm of tohSeq) {
      let idur = Math.max(1, itm.dur);
      if (c < idur) return { ...itm, seekPos: c, remaining: idur - c };
      c -= idur;
    }
  }
  // 3. Bloque de las y media (:30)
  else if (secInHour >= 1800 && secInHour < 1800 + blockDur30 && (!scheduledShow || scheduledShow.startSecs % 3600 === 1800)) {
    let c = secInHour - 1800;
    for (let itm of toh30Seq) {
      let idur = Math.max(1, itm.dur);
      if (c < idur) return { ...itm, seekPos: c, remaining: idur - c };
      c -= idur;
    }
  }
  // 4. Programa Específico
  else if (scheduledShow) {
    let delay = (scheduledShow.startSecs % 3600 === 0) ? blockDur00 : ((scheduledShow.startSecs % 3600 === 1800) ? blockDur30 : 0);
    let seekPos = Math.max(0, (secInDay - scheduledShow.startSecs) - delay);
    return { ...scheduledShow, seekPos, remaining: Math.max(1, scheduledShow.dur - seekPos) };
  }

  // 5. Relleno automático (Filler)
  return getGlobalFiller(secInDay);
}

function initScheduleManager() {
  fetchSheetData();
  setInterval(fetchSheetData, CONFIG.pollInterval * 1000);
}

module.exports = { initScheduleManager, getCurrentTrackInfo, getSpainTime };
