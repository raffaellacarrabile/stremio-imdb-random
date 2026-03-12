process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. FUNZIONE DATA
// ==========================================
function getLastUpdateDate() {
    try {
        const filePath = path.join(__dirname, 'watchlist.csv');
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            return stats.mtime.toLocaleString('it-IT', { 
                day: '2-digit', month: '2-digit', year: '2-digit', 
                hour: '2-digit', minute: '2-digit' 
            });
        }
    } catch (e) { console.error("Errore data file:", e); }
    return "N/D";
}

// ==========================================
// 2. FUNZIONE LETTURA CSV
// ==========================================
function loadCsvWatchlist() {
    try {
        const filePath = path.join(__dirname, 'watchlist.csv');
        if (!fs.existsSync(filePath)) {
            console.error("❌ ERRORE: File 'watchlist.csv' non trovato!");
            return [];
        }
        console.log("📂 Leggo il file watchlist.csv...");
        const data = fs.readFileSync(filePath, 'utf8');
        const regex = /(tt\d+)/g;
        const matches = [...data.matchAll(regex)];
        const ids = matches.map(m => m[1]);
        const uniqueIds = [...new Set(ids)];
        console.log(`✅ CARICATI ${uniqueIds.length} FILM DAL FILE CSV!`);
        return uniqueIds;
    } catch (error) {
        console.error("🔥 Errore lettura CSV:", error.message);
        return [];
    }
}

// ==========================================
// 3. CONFIGURAZIONE E MANIFEST (V2)
// ==========================================
let IMDB_WATCHLIST_IDS = loadCsvWatchlist();
const lastDate = getLastUpdateDate();

const manifest = {
    id: 'org.imdb.random.csv.v2', // <--- NUOVO ID ADDON
    version: '4.0.1',
    name: `IMDb Random (${lastDate})`,
    description: `Carica 900+ film. Ultimo aggiornamento: ${lastDate}`,
    resources: ['catalog'],
    types: ['movie', 'series'],
    catalogs: [{
        id: 'imdb_csv_random_v2', // <--- NUOVO ID CATALOGO
        name: `IMDb CSV (${lastDate})`,
        type: 'movie',
        extra: [{ name: 'search', isRequired: false }]
    }],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);
const axiosConfig = { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } };

// ==========================================
// 4. LOGICA RANDOM E CATALOGO
// ==========================================
async function getRandomItem(retries = 8) {
    if (retries <= 0) return null;
    const randomIndex = Math.floor(Math.random() * IMDB_WATCHLIST_IDS.length);
    const id = IMDB_WATCHLIST_IDS[randomIndex];
    try {
        let url = `https://v3-cinemeta.strem.io/meta/movie/${id}.json`;
        let res = await axios.get(url, axiosConfig).catch(() => null);
        if (!res || !res.data || !res.data.meta) {
            url = `https://v3-cinemeta.strem.io/meta/series/${id}.json`;
            res = await axios.get(url, axiosConfig).catch(() => null);
        }
        if (res && res.data && res.data.meta) {
            res.data.meta.type = res.data.meta.type || 'movie';
            return res.data.meta;
        }
    } catch (e) { }
    return await getRandomItem(retries - 1);
}

builder.defineCatalogHandler(async (args) => {
    // ATTENZIONE: AGGIORNATO ANCHE QUI L'ID DEL CATALOGO
    if (args.id === 'imdb_csv_random_v2') {
        if (IMDB_WATCHLIST_IDS.length === 0) {
            return { metas: [{ id: 'tt_error', type: 'movie', name: 'CSV VUOTO O MANCANTE' }] };
        }
        const moviePromises = Array.from({ length: 10 }, () => getRandomItem());
        const results = await Promise.all(moviePromises);
        const items = results.filter(item => item !== null);
        
        return {
            metas: items, // <--- BOTTONE NERO RIMOSSO: SOLO FILM!
            cacheMaxAge: 0
        };
    }
    return { metas: [] };
});

// ==========================================
// 5. AVVIO
// ==========================================
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
