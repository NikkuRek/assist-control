const express = require('express');
const path = require('path');
const fs = require('fs').promises; 
const digestAuthLib = require('digest-fetch');
const DigestFetch = digestAuthLib.default || digestAuthLib;

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

// --- CONFIGURACIÓN HIKVISION ---
const CONFIG = { ip: '192.168.0.20', user: 'admin', pass: 'grupo*2025' };
CONFIG.url_events = `http://${CONFIG.ip}/ISAPI/AccessControl/AcsEvent?format=json`;
CONFIG.url_users  = `http://${CONFIG.ip}/ISAPI/AccessControl/UserInfo/Search?format=json`;

const client = new DigestFetch(CONFIG.user, CONFIG.pass);

// --- ARCHIVOS ---
const FILE_SCHEDULES = path.join(__dirname, 'data', 'schedules.json');
const FILE_EMPLOYEES = path.join(__dirname, 'data', 'employees.json');

// Helpers IO
async function readJson(file) {
    try { return JSON.parse(await fs.readFile(file, 'utf-8')); } catch (e) { return []; }
}
async function writeJson(file, data) {
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

// --- API CRUD ---
app.get('/api/schedules', async (req, res) => res.json(await readJson(FILE_SCHEDULES)));
app.post('/api/schedules', async (req, res) => { await writeJson(FILE_SCHEDULES, req.body); res.json({ success: true }); });

app.get('/api/employees', async (req, res) => res.json(await readJson(FILE_EMPLOYEES)));
app.post('/api/employees', async (req, res) => { await writeJson(FILE_EMPLOYEES, req.body); res.json({ success: true }); });

// --- API HIKVISION: OBTENER USUARIOS DEL DISPOSITIVO ---
app.get('/api/hik-users', async (req, res) => {
    console.log("📡 Consultando usuarios en el biométrico...");
    
    // Payload para pedir usuarios
    const payload = {
        UserInfoSearchCond: {
            searchID: "user_search_" + Date.now(),
            maxResults: 1000, // Pedimos hasta 1000 usuarios de una vez
            searchResultPosition: 0
        }
    };

    try {
        const response = await client.fetch(CONFIG.url_users, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Error Hikvision: ${response.status}`);

        const data = await response.json();
        
        let users = [];
        if (data.UserInfoSearch && data.UserInfoSearch.UserInfo) {
            // Normalizar a array (si es uno solo, Hikvision a veces no devuelve array)
            const list = Array.isArray(data.UserInfoSearch.UserInfo) 
                ? data.UserInfoSearch.UserInfo 
                : [data.UserInfoSearch.UserInfo];

            users = list.map(u => ({
                id: u.employeeNo,
                name: u.name
            }));
        }

        console.log(`✅ ${users.length} usuarios encontrados en el dispositivo.`);
        res.json(users);

    } catch (error) {
        console.error("❌ Error fetching users:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- API HIKVISION: EVENTOS (La de siempre) ---
app.get('/api/eventos', async (req, res) => {
    // ... (Mantén tu código de eventos anterior aquí) ...
    // Para no hacer el código gigante, asumo que dejas la lógica del 
    // endpoint /api/eventos que ya funcionaba perfectamente.
    // Si la necesitas completa dímelo.
    
    // --- PEGA AQUÍ TU LÓGICA DE EVENTOS ANTERIOR ---
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'Faltan fechas' });

    const strStartTime = `${start}T00:00:00-04:00`;
    const strEndTime = `${end}T23:59:59-04:00`;

    let allRawEvents = [];
    let position = 0;
    let hasMore = true;
    const CHUNK_SIZE = 30;

    try {
        while (hasMore) {
            const payload = {
                AcsEventCond: {
                    searchID: "web_" + Date.now(),
                    searchResultPosition: position,
                    maxResults: CHUNK_SIZE,
                    major: 0, minor: 0,
                    startTime: strStartTime, endTime: strEndTime
                }
            };
            const response = await client.fetch(CONFIG.url_events, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (data.AcsEvent && data.AcsEvent.InfoList && data.AcsEvent.InfoList.length > 0) {
                const batch = data.AcsEvent.InfoList;
                allRawEvents = allRawEvents.concat(batch);
                if (batch.length < CHUNK_SIZE) hasMore = false; else position += batch.length;
            } else { hasMore = false; }
        }
        
        // Mapeo simple para que el frontend lo reciba
        const asistencia = allRawEvents
            .filter(e => (e.minor === 75 || e.minor === 76 || e.minor === 38 || e.minor === 167) && e.employeeNoString)
            .map(e => ({
                fecha: e.time.substring(0, 10),
                hora: e.time.substring(11, 19),
                id: e.employeeNoString,
                nombre: e.name,
                metodo: e.minor === 167 ? "Rostro" : "Huella/Tarjeta"
            }))
            .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

        res.json(asistencia);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor listo en: http://localhost:${PORT}`);
});