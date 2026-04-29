const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const digestAuthLib = require('digest-fetch');
const DigestFetch = digestAuthLib.default || digestAuthLib;

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- CONFIGURACIÓN HIKVISION ---
const CONFIG = { ip: '192.168.30.253', user: 'admin', pass: 'grupo*2025' };
CONFIG.url_events = `http://${CONFIG.ip}/ISAPI/AccessControl/AcsEvent?format=json`;
CONFIG.url_users = `http://${CONFIG.ip}/ISAPI/AccessControl/UserInfo/Search?format=json`;

const client = new DigestFetch(CONFIG.user, CONFIG.pass);

// --- ARCHIVOS DE DATOS ---
const FILE_SCHEDULES = path.join(__dirname, 'data', 'schedules.json');
const FILE_EMPLOYEES = path.join(__dirname, 'data', 'employees.json');
const FILE_DEPTS = path.join(__dirname, 'data', 'departments.json');

// Helpers
async function readJson(file) {
    try { return JSON.parse(await fs.readFile(file, 'utf-8')); }
    catch (e) { return {}; }
}
async function writeJson(file, data) { await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8'); }

// --- API GENERAL ---
app.get('/api/schedules', async (req, res) => res.json(await readJson(FILE_SCHEDULES)));
app.post('/api/schedules', async (req, res) => { await writeJson(FILE_SCHEDULES, req.body); res.json({ success: true }); });

app.get('/api/employees', async (req, res) => res.json(await readJson(FILE_EMPLOYEES)));
app.post('/api/employees', async (req, res) => { await writeJson(FILE_EMPLOYEES, req.body); res.json({ success: true }); });

app.get('/api/departments', async (req, res) => res.json(await readJson(FILE_DEPTS)));
app.post('/api/departments', async (req, res) => { await writeJson(FILE_DEPTS, req.body); res.json({ success: true }); });

// --- API HIKVISION: USUARIOS (CON PAGINACIÓN Y DICCIONARIO) ---
app.get('/api/hik-users', async (req, res) => {
    console.log("📡 Conectando al biométrico para descargar usuarios...");

    try {
        // 1. LEER DICCIONARIO DE DEPARTAMENTOS
        const deptMap = await readJson(FILE_DEPTS);

        // 2. BUCLE DE PAGINACIÓN PARA USUARIOS
        let allUsersRaw = [];
        let position = 0;
        let hasMore = true;
        const CHUNK = 30; // Pedimos de 30 en 30 porque el equipo corta si pedimos más

        while (hasMore) {
            const userPayload = {
                UserInfoSearchCond: {
                    searchID: "usr_pag_" + Date.now(),
                    maxResults: CHUNK,
                    searchResultPosition: position
                }
            };

            // console.log(`⏳ Descargando bloque desde posición ${position}...`); // Descomentar para debug

            const userRes = await client.fetch(CONFIG.url_users, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userPayload)
            });

            if (!userRes.ok) {
                console.warn(`⚠️ Error en bloque ${position}: ${userRes.status}`);
                hasMore = false;
                break;
            }

            const userData = await userRes.json();

            if (userData.UserInfoSearch && userData.UserInfoSearch.UserInfo) {
                const list = Array.isArray(userData.UserInfoSearch.UserInfo)
                    ? userData.UserInfoSearch.UserInfo
                    : [userData.UserInfoSearch.UserInfo];

                allUsersRaw = allUsersRaw.concat(list);

                // Si recibimos menos de lo que pedimos, es que ya no hay más
                if (list.length < CHUNK) {
                    hasMore = false;
                } else {
                    position += list.length;
                }
            } else {
                // No devolvió nada, fin de la lista
                hasMore = false;
            }
        }

        console.log(`✅ Total descargado: ${allUsersRaw.length} usuarios.`);

        // 3. PROCESAR DATOS
        const users = allUsersRaw.map(u => {
            const gid = u.groupId || u.userGroup || u.belongGroup;
            const deptObj = deptMap.find(d => String(d.id) === String(gid));
            const deptName = deptObj ? deptObj.name : (gid ? `GRUPO ID ${gid}` : "Sin Asignar");

            return {
                id: u.employeeNo,
                name: u.name,
                department: deptName
            };
        });

        res.json(users);

    } catch (error) {
        console.error("❌ Error General:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- API EVENTOS ---
app.get('/api/eventos', async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'Faltan fechas' });
    const strStartTime = `${start}T00:00:00-04:00`;
    const strEndTime = `${end}T23:59:59-04:00`;
    let allRawEvents = [];
    let position = 0;
    let hasMore = true;
    const CHUNK_SIZE = 30;

    try {
        const employeesDb = await readJson(FILE_EMPLOYEES);
        const schedulesDb = await readJson(FILE_SCHEDULES);

        while (hasMore) {
            const payload = {
                AcsEventCond: {
                    searchID: "web_" + Date.now(), searchResultPosition: position, maxResults: CHUNK_SIZE,
                    major: 0, minor: 0, startTime: strStartTime, endTime: strEndTime
                }
            };
            const response = await client.fetch(CONFIG.url_events, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (!response.ok) { hasMore = false; break; }
            const data = await response.json();
            if (data.AcsEvent && data.AcsEvent.InfoList && data.AcsEvent.InfoList.length > 0) {
                const batch = data.AcsEvent.InfoList;
                allRawEvents = allRawEvents.concat(batch);
                if (batch.length < CHUNK_SIZE) hasMore = false; else position += batch.length;
            } else { hasMore = false; }
        }

        const asistencia = allRawEvents
            .filter(e => (e.minor === 75 || e.minor === 76 || e.minor === 38 || e.minor === 167) && e.employeeNoString)
            .map(e => {
                const emp = employeesDb.find(dbEmp => String(dbEmp.id) === String(e.employeeNoString));
                const fecha = e.time.substring(0, 10);
                let schedIn = (emp && emp.scheduleId) ? "LIBRE" : "SIN_ASIGNAR";
                let schedOut = (emp && emp.scheduleId) ? "LIBRE" : "SIN_ASIGNAR";

                // Determinar horario según scheduleId y día de la semana o ciclo
                if (emp && emp.scheduleId) {
                    const sched = schedulesDb.find(s => s.id === emp.scheduleId);
                    if (sched && sched.dias) {
                        // Para simplificar: tomaremos el día de la semana de la fecha del evento (1=Lunes..7=Domingo)
                        // Esto funciona bien para horarios fijos semanales. Para rotativos o dinámicos requiere lógica de fechaAncla.
                        // Aplicaremos lógica básica de día de la semana (1-7) si totalDiasCiclo es 7.
                        const dateObj = new Date(fecha + "T12:00:00Z");
                        let dayIndex = dateObj.getUTCDay(); // 0 = Domingo, 1 = Lunes
                        dayIndex = dayIndex === 0 ? 7 : dayIndex; // Ajustar a 1=Lunes, 7=Domingo

                        let dayConfig = sched.dias.find(d => d.n === dayIndex);

                        // Si es ciclo superior a 7, calculamos días desde la ancla
                        if (sched.totalDiasCiclo > 7 && sched.fechaAncla) {
                            const ancla = new Date(sched.fechaAncla + "T12:00:00Z");
                            const diffTime = Math.abs(dateObj - ancla);
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            let n = (diffDays % sched.totalDiasCiclo) + 1;
                            dayConfig = sched.dias.find(d => d.n === n);
                        }

                        if (dayConfig && dayConfig.tipo !== 'libre' && dayConfig.tipo !== 'saliente' && dayConfig.in && dayConfig.out) {
                            schedIn = dayConfig.in;
                            schedOut = dayConfig.out;
                        } else if (dayConfig && (dayConfig.tipo === 'libre' || dayConfig.tipo === 'saliente')) {
                            schedIn = "LIBRE";
                            schedOut = "LIBRE";
                        }
                    }
                }

                return {
                    fecha: fecha,
                    hora: e.time.substring(11, 19),
                    id: e.employeeNoString,
                    nombre: e.name,
                    depto: emp ? emp.depto : "Sin Asignar",
                    metodo: e.minor === 167 ? "Rostro" : "Huella/Tarjeta",
                    schedIn: schedIn,
                    schedOut: schedOut
                };
            })
            .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
        res.json(asistencia);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- PROXY DE IMAGEN (Evita bloqueo CORS del navegador al descargar imágenes externas) ---
const https = require('https');
const http = require('http');

app.get('/api/logo', (req, res) => {
    const imageUrl = 'https://previasis.com/aws/previasis0.png';
    const protocol = imageUrl.startsWith('https') ? https : http;

    protocol.get(imageUrl, (imgRes) => {
        if (imgRes.statusCode !== 200) {
            return res.status(imgRes.statusCode).json({ error: 'No se pudo descargar el logo' });
        }
        res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/png');
        imgRes.pipe(res);
    }).on('error', (e) => {
        console.error('❌ Error al descargar logo:', e.message);
        res.status(500).json({ error: e.message });
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor listo en: http://localhost:${PORT}`);
});