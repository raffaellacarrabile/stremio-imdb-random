process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const fs = require('fs'); // Modulo per leggere i file
const path = require('path');

// ==========================================
// LISTA ID (Si riempie dal file CSV)
// ==========================================
let IMDB_WATCHLIST_IDS = [];

// ==========================================
// MANIFEST
// ==========================================
const manifest = {
    id: 'org.imdb.random.csv',
    version: '4.0.0',
    name: 'IMDb Random (900+)',
    description: 'Carica 900+ film dal file watchlist.csv locale.',
    resources: ['catalog'],
    types: ['movie', 'series'],
    catalogs: [{
        id: 'imdb_csv_random',
        name: 'IMDb CSV Random',
        type: 'movie',
        extra: [{ name: 'search', isRequired: false }]
    }],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

const axiosConfig = {
    timeout: 5000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
};

// --- 1. FUNZIONE CHE LEGGE IL CSV ---
function loadCsvWatchlist() {
    try {
        const filePath = path.join(__dirname, 'watchlist.csv');

        if (!fs.existsSync(filePath)) {
            console.error("❌ ERRORE: File 'watchlist.csv' non trovato nella cartella!");
            return [];
        }

        console.log("📂 Leggo il file watchlist.csv...");
        const data = fs.readFileSync(filePath, 'utf8');

        // Cerca tutti i codici tt1234567 nel file
        // I CSV di IMDb hanno il codice ID in una colonna specifica, ma la Regex li trova ovunque
        const regex = /(tt\d+)/g;
        const matches = [...data.matchAll(regex)];
        const ids = matches.map(m => m[1]);
        const uniqueIds = [...new Set(ids)]; // Rimuove duplicati

        console.log(`✅ CARICATI ${uniqueIds.length} FILM DAL FILE CSV!`);
        return uniqueIds;

    } catch (error) {
        console.error("🔥 Errore lettura CSV:", error.message);
        return [];
    }
}

// --- 2. FUNZIONE PESCA FILM ---
async function getRandomItem(retries = 8) {
    if (retries <= 0) return null;

    const randomIndex = Math.floor(Math.random() * IMDB_WATCHLIST_IDS.length);
    const id = IMDB_WATCHLIST_IDS[randomIndex];

    // console.log(`🎲 Tento ID: ${id}`); // Decommenta se vuoi vedere i log

    try {
        // Tenta Movie
        let url = `https://v3-cinemeta.strem.io/meta/movie/${id}.json`;
        let res = await axios.get(url, axiosConfig).catch(() => null);

        // Tenta Series
        if (!res || !res.data || !res.data.meta) {
            url = `https://v3-cinemeta.strem.io/meta/series/${id}.json`;
            res = await axios.get(url, axiosConfig).catch(() => null);
        }

        // Fallback
        if (!res || !res.data || !res.data.meta) {
            url = `https://cinemeta.strem.io/meta/movie/${id}.json`;
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
            return {
                metas: [{
                    id: 'tt_error', type: 'movie', name: 'FILE CSV MANCANTE',
                    poster: 'https://via.placeholder.com/300x450?text=METTI+IL+CSV',
                    description: 'Scarica watchlist.csv da IMDb e mettilo nella cartella del server.'
                }]
            };
        }

        // --- MODIFICA QUI: Generiamo 10 film ---
        const moviePromises = [];
        for (let i = 0; i < 10; i++) {
            moviePromises.push(getRandomItem());
        }

        // Aspettiamo che tutte le richieste a Cinemeta siano completate
        const results = await Promise.all(moviePromises);
        
        // Filtriamo eventuali null (se un film non viene trovato dopo i tentativi)
        const items = results.filter(item => item !== null);

        // Bottone Refresh in cima
        const refreshBtn = {
            id: 'tt_refresh',
            type: 'movie',
            name: '🔄 GENERA ALTRI 10',
            poster: 'https://dummyimage.com/600x900/000/fff&text=CLICCA+E+TORNA+INDIETRO',
            description: 'Torna indietro e riapri per cambiare lista.'
        };

        return {
            metas: [refreshBtn, ...items], // Uniamo il tasto refresh ai 10 film
            cacheMaxAge: 0,
            staleRevalidate: 0,
            staleError: 0
        };
    }
    return { metas: [] };
});

// AVVIO
IMDB_WATCHLIST_IDS = loadCsvWatchlist(); // Carica la lista all'avvio
const addonInterface = builder.getInterface();
const port = process.env.PORT || 7000;

serveHTTP(addonInterface, { port: port });
