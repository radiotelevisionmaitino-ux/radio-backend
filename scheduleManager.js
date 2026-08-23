const CONFIG = {
  api: "https://script.google.com/macros/s/AKfycbzoQfFFkwSOoZlnX73FKn8lEtbcRSEe6CYXPeuZ6tZPG5OsBuXivvvGtBJhGJhPC7GU/exec",
  pollInterval: 90
};

let library = { filler: [] };

// 1. Recuperamos tu reloj geocéntrico maestro del HTML
function getSpainTime() {
  let now = new Date();
  let pts = new Intl.DateTimeFormat('en-US', { 
    timeZone: 'Europe/Madrid', 
    year: 'numeric', month: 'numeric', day: 'numeric', 
    hour: 'numeric', minute: 'numeric', second: 'numeric', 
    hour12: false 
  }).formatToParts(now);
  let v = {}; pts.forEach(p => v[p.type] = p.value);
  return new Date(v.year, v.month - 1, v.day, (v.hour === "24" ? 0 : v.hour), v.minute, v.second, now.getMilliseconds());
}

async function fetchSheetData() {
  try {
    const res = await fetch(CONFIG.api);
    const data = await res.json();
    let newFiller = [];
    
    data.forEach(row => {
      let src = String(row.src || "").trim();
      if (src && !src.startsWith('file:///')) {
        newFiller.push({ 
          src: src, 
          title: row.title || "Emisión",
          // ¡VITAL! Rescatamos la duración de tu Sheet para calcular la posición
          dur: parseInt(row.duration) || 300 
        });
      }
    });
    
    if (newFiller.length > 0) {
        library.filler = newFiller;
        console.log(`[PARRILLA] Actualizada: ${library.filler.length} audios listos.`);
    }
  } catch (e) {
    console.error("[ERROR API] No se pudo leer Google Sheets:", e.message);
  }
}

// 2. Cálculo determinista: Igual para todo el mundo
function getCurrentTrackInfo() {
  if (library.filler.length === 0) {
    return { 
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", 
        title: "Audio de Seguridad", 
        seekPos: 0, 
        remaining: 300 
    };
  }

  const now = getSpainTime();
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const secInDay = h * 3600 + m * 60 + s;

  // Sumamos la duración total del bucle
  let totalDuration = library.filler.reduce((a, b) => a + Math.max(1, b.dur), 0);
  let currentSec = secInDay % (totalDuration || 1);

  // Buscamos qué canción encaja en este segundo exacto del día
  for (let itm of library.filler) {
    let idur = Math.max(1, itm.dur);
    if (currentSec < idur) {
      return { 
          src: itm.src,
          title: itm.title,
          seekPos: currentSec, // El segundo exacto por el que va la canción
          remaining: idur - currentSec // Cuántos segundos le quedan para terminar
      };
    }
    currentSec -= idur;
  }
  
  return { src: library.filler[0].src, title: library.filler[0].title, seekPos: 0, remaining: library.filler[0].dur };
}

function initScheduleManager() {
  fetchSheetData();
  setInterval(fetchSheetData, CONFIG.pollInterval * 1000);
}

module.exports = { initScheduleManager, getCurrentTrackInfo, getSpainTime };
