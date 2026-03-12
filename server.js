process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- FUNZIONE PER OTTENERE LA DATA DEL FILE ---
function getLastUpdateDate() {
    try {
        const filePath = path.join(__dirname, 'watchlist.csv');
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            // Formato: DD/MM/YY HH:mm
            return stats.mtime.toLocaleString('it-IT', { 
                day: '2-digit', 
                month: '2-digit', 
                year: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
    } catch (e) {
        console.error("Errore data file:", e);
    }
    return "N/D";
}

// ==========================================
// MANIFEST DINAMICO
// ==========================================
const lastDate = getLastUpdateDate();

const manifest = {
    id: 'org.imdb.random.csv',
    version: '4.0.0',
    name: `IMDb Random (${lastDate})`, // <--- Data nel nome dell'Addon
    description: `Ultimo aggiornamento CSV: ${lastDate}`,
    resources: ['catalog'],
    types: ['movie', 'series'],
    catalogs: [{
        id: 'imdb_csv_random',
        name: `IMDb CSV (${lastDate})`, // <--- Data nel titolo del catalogo
        type: 'movie',
        extra: [{ name: 'search', isRequired: false }]
    }],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// ... (Mantenere le tue funzioni loadCsvWatchlist, getRandomItem e il builder.defineCatalogHandler invariate) ...

// ==========================================
// AVVIO (Sincronizzazione)
// ==========================================
let IMDB_WATCHLIST_IDS = loadCsvWatchlist(); 

// Invece di definire addonInterface in modo statico, 
// la generiamo al momento dell'avvio del server.
const port = process.env.PORT || 7000;

// Utilizziamo l'interfaccia dal builder
serveHTTP(builder.getInterface(), { port: port });
