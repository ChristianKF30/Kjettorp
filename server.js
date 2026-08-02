import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import cheerio from 'cheerio';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Tillat serveren å lese JSON-data fra frontend
app.use(express.json());

// Server statiske filer (HTML-filen din) fra mappen over denne
app.use(express.static(path.join(__dirname, '..')));

// Set up PostgreSQL database pool if DATABASE_URL is provided
let pool = null;
if (process.env.DATABASE_URL) {
    console.log('[Server] DATABASE_URL funnet. Kobler til PostgreSQL...');
    pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : {
            rejectUnauthorized: false
        }
    });

    // Opprett tabellen hvis den ikke eksisterer
    pool.query(`
        CREATE TABLE IF NOT EXISTS wishes (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            imdb_url TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).then(() => {
        console.log('[Server] Database-tabell verifisert.');
    }).catch(err => {
        console.error('[Server] Feil ved oppsett av database:', err.message);
    });
} else {
    console.log('[Server] Ingen DATABASE_URL funnet. Kjører med midlertidig minne (RAM).');
}

// Midlertidig database i minnet (RAM) som fallback
let databaseWishes = [];

// 1. HENT ALLE ØNSKER (GET /api/wishes)
app.get('/api/wishes', async (req, res) => {
    if (pool) {
        try {
            const result = await pool.query('SELECT * FROM wishes ORDER BY created_at DESC');
            res.json(result.rows);
        } catch (err) {
            console.error('[Server] Feil ved henting fra DB:', err.message);
            res.status(500).json({ error: 'Kunne ikke hente ønsker fra databasen.' });
        }
    } else {
        res.json(databaseWishes);
    }
});

// 2. LEGG TIL NYTT ØNSKE (POST /api/wishes)
app.post('/api/wishes', async (req, res) => {
    const { url } = req.body;

    if (!url || !url.includes('imdb.com')) {
        return res.status(400).json({ error: 'Ugyldig IMDb-lenke. Må være en IMDb-adresse.' });
    }

    // Finn IMDb-ID-en fra URL-en (f.eks. tt33764258)
    const imdbIdMatch = url.match(/(tt\d+)/);
    const imdbId = imdbIdMatch ? imdbIdMatch[1] : null;

    let title = '';
    let type = 'Film'; // Standard fallback

    // FØRSTEVALG: Hent direkte fra IMDbs interne søke-API
    if (imdbId) {
        try {
            console.log(`\n[Server] Prøver å hente via IMDb API for ID: ${imdbId}`);
            const firstChar = imdbId[0].toLowerCase();
            const apiUrl = `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${imdbId}.json`;

            const apiResponse = await axios.get(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if (apiResponse.data && apiResponse.data.d) {
                // Finn objektet i listen som matcher vår ID
                const match = apiResponse.data.d.find(item => item.id === imdbId);
                if (match) {
                    title = match.l; // Filmens tittel

                    // Sjekk om det er en serie
                    const qid = match.qid || '';
                    const isSeries = qid.includes('tv') || qid.includes('series');
                    type = isSeries ? 'Serie' : 'Film';

                    // Legg til årstall hvis tilgjengelig (f.eks "The Odyssey (2026)")
                    if (match.y) {
                        title = `${title} (${match.y})`;
                    }
                    console.log(`[Server] Suksess med API! Fant: "${title}" (${type})`);
                }
            }
        } catch (apiError) {
            console.warn(`[Server] IMDb API feilet (${apiError.message}). Prøver HTML-skraping som fallback...`);
        }
    }

    // ANDREVALG (FALLBACK): Hvis API-et ikke fungerte, prøver vi vanlig skraping
    if (!title) {
        try {
            console.log(`[Server] Henter HTML fra nettsiden: ${url}`);
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'no-NO,no;q=0.9,en-US;q=0.8',
                    'Cache-Control': 'no-cache',
                    'Referer': 'https://www.google.com/'
                }
            });

            console.log(`[Server] HTML-størrelse mottatt: ${response.data.length} tegn.`);
            const $ = cheerio.load(response.data);

            const ogTitle = $('meta[property="og:title"]').attr('content');
            if (ogTitle) {
                title = ogTitle.replace(' - IMDb', '').trim();
            }

            if (!title) {
                title = $('title').text().replace(' - IMDb', '').trim();
            }

            if (!title) {
                title = $('h1').text().trim();
            }

            const isSeries = response.data.includes('TV Series') || response.data.includes('TVMiniSeries');
            type = isSeries ? 'Serie' : 'Film';

        } catch (scrapeError) {
            console.error('[Server] HTML-skraping feilet også:', scrapeError.message);
        }
    }

    // Hvis vi absolutt ikke fant tittel noe sted
    if (!title || title.toLowerCase() === 'imdb' || title.includes('403 Forbidden')) {
        title = 'Ukjent tittel';
    }

    // Opprett og lagre ønsket
    if (pool) {
        try {
            const result = await pool.query(
                'INSERT INTO wishes (title, imdb_url, type) VALUES ($1, $2, $3) RETURNING *',
                [title, url, type]
            );
            console.log(`[Server] Ønske lagret i DB: "${title}" (${type})`);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            if (err.code === '23505') { // Unique violation
                return res.status(409).json({ error: 'Dette ligger allerede i ønskelisten din.' });
            }
            console.error('[Server] Feil ved lagring i DB:', err.message);
            res.status(500).json({ error: 'Kunne ikke lagre til databasen.' });
        }
    } else {
        const newWish = {
            id: Date.now().toString(),
            title: title,
            imdb_url: url,
            type: type
        };
        databaseWishes.push(newWish);
        console.log(`[Server] Ønske lagret i RAM: "${newWish.title}" (${newWish.type})`);
        res.status(201).json(newWish);
    }
});

// 3. SLETT ET ØNSKE (DELETE /api/wishes/:id)
app.delete('/api/wishes/:id', async (req, res) => {
    const { id } = req.params;

    if (pool) {
        try {
            // Siden ID i PostgreSQL er INTEGER (SERIAL), konverterer vi id-strengen til et tall
            const numericId = parseInt(id, 10);
            if (isNaN(numericId)) {
                return res.status(400).json({ error: 'Ugyldig ID-format.' });
            }
            const result = await pool.query('DELETE FROM wishes WHERE id = $1', [numericId]);
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Fant ikke ønsket' });
            }
            console.log(`[Server] Slettet ønske med ID: ${id} fra DB`);
            res.json({ message: 'Ønske fjernet' });
        } catch (err) {
            console.error('[Server] Feil ved sletting i DB:', err.message);
            res.status(500).json({ error: 'Kunne ikke slette fra databasen.' });
        }
    } else {
        const initialLength = databaseWishes.length;
        databaseWishes = databaseWishes.filter(wish => wish.id !== id);

        if (databaseWishes.length < initialLength) {
            console.log(`[Server] Slettet ønske med ID: ${id} fra RAM`);
            res.status(200).json({ message: 'Ønske fjernet' });
        } else {
            res.status(404).json({ error: 'Fant ikke ønsket' });
        }
    }
});

// Start serveren
app.listen(PORT, () => {
    console.log(`Serveren kjører på http://localhost:${PORT}`);
});

