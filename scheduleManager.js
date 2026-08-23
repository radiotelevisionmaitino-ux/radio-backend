const CONFIG = {
  api: "https://script.google.com/macros/s/AKfycbzoQfFFkwSOoZlnX73FKn8lEtbcRSEe6CYXPeuZ6tZPG5OsBuXivvvGtBJhGJhPC7GU/exec",
  pollInterval: 90
};

let library = { filler: [] };

async function fetchSheetData() {
  try {
    const res = await fetch(CONFIG.api);
    const data = await res.json();
    let newFiller = [];
    
    data.forEach(row => {
      let src = String(row.src || "").trim();
      // FILTRO TODOTERRENO: Ignora enlaces locales que romperían el servidor
      if (src && !src.startsWith('file:///')) {
        newFiller.push({ src, title: row.title || "Emisión" });
      }
    });
    
    library.filler = newFiller;
  } catch (e) {
    console.error("Error API:", e.message);
  }
}

function getNextTrackToPlay() {
  if (library.filler.length === 0) {
    return { src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", title: "Audio de Seguridad" };
  }
  let now = new Date();
  let index = Math.floor(now.getSeconds() / 10) % library.filler.length;
  return library.filler[index];
}

function initScheduleManager() {
  fetchSheetData();
  setInterval(fetchSheetData, CONFIG.pollInterval * 1000);
}

module.exports = { initScheduleManager, getNextTrackToPlay };
