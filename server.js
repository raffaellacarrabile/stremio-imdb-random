process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. FUNZIONE DATA (Per il titolo)
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
// 2. FUNZIONE LETTURA CSV (Quella che mancava!)
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
// 3. CONFIGURAZIONE E MANIFEST
// ==========================================
let IMDB_WATCHLIST_IDS = loadCsvWatchlist();
const lastDate = getLastUpdateDate();

const manifest = {
    id: 'org.imdb.random.csv',
    version: '4.0.0',
    name: `IMDb Random (${lastDate})`,
    description: `Carica 900+ film. Ultimo aggiornamento: ${lastDate}`,
    resources: ['catalog'],
    types: ['movie', 'series'],
    catalogs: [{
        id: 'imdb_csv_random',
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
    if (args.id === 'imdb_csv_random') {
        if (IMDB_WATCHLIST_IDS.length === 0) {
            return { metas: [{ id: 'tt_error', type: 'movie', name: 'CSV VUOTO O MANCANTE' }] };
        }
        const moviePromises = Array.from({ length: 10 }, () => getRandomItem());
        const results = await Promise.all(moviePromises);
        const items = results.filter(item => item !== null);
        
        return {
            metas: [{
                id: 'tt_refresh',
                type: 'movie',
                name: `🔄 REFRESH (${lastDate})`,
                poster: 'https://dummyimage.com/600x900/000/fff&text=CLICCA+E+TORNA+INDIETRO',
                description: 'Aggiorna per nuovi film.'
            }, ...items],
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
