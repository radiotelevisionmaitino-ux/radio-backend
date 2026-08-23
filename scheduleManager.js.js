const CONFIG = {
  api: "https://script.google.com/macros/s/AKfycbzoQfFFkwSOoZlnX73FKn8lEtbcRSEe6CYXPeuZ6tZPG5OsBuXivvvGtBJhGJhPC7GU/exec",
  pollInterval: 90
};

let library = {
  schedule: { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] },
  filler: []
};

function getSpainTime() {
  let now = new Date();
  let pts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  }).formatToParts(now);
  let v = {}; pts.forEach(p => v[p.type] = p.value);
  return new Date(v.year, v.month - 1, v.day, (v.hour === "24" ? 0 : v.hour), v.minute, v.second);
}

async function fetchSheetData() {
  try {
    const res = await fetch(CONFIG.api, { redirect: 'follow' });
    const data = await res.json();
    
    // Reiniciar biblioteca
    let newLibrary = { schedule: { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] }, filler: [] };
    
    data.forEach(row => {
      if (!row.type || String(row.type).trim() === "") return;
      let item = {
        src: String(row.src || "").trim(),
        title: row.title || "Emisión",
        artist: row.artist || "Radio Maitino",
        dur: parseInt(row.duration) || 300,
        type: row.type.toLowerCase()
      };
      // Por simplicidad en este paso, guardamos todo como relleno (filler)
      // Aquí puedes expandir la lógica exacta de prioridades (news, jingles) que tenías en tu HTML
      newLibrary.filler.push(item); 
    });

    library = newLibrary;
    console.log("Parrilla sincronizada con Google Sheets.");
  } catch (e) {
    console.error("Error al sincronizar Google Sheets:", e.message);
  }
}

function getNextTrackToPlay() {
  if (library.filler.length === 0) {
    // Audio de seguridad (silencio o jingle por defecto) si falla la API
    return { src: "https://ia600602.us.archive.org/32/items/r-maitino-psd-1400.1400/r%20maitino%20psd%201400.1400.png", title: "Cargando" };
  }
  
  // Rota las canciones de la lista de relleno (puedes ajustar esto para que use horarios exactos)
  const now = getSpainTime();
  const index = Math.floor(now.getSeconds() / 10) % library.filler.length;
  return library.filler[index];
}

function initScheduleManager() {
  fetchSheetData();
  setInterval(fetchSheetData, CONFIG.pollInterval * 1000);
}

module.exports = { initScheduleManager, getNextTrackToPlay, getSpainTime };