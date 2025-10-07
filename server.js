// server.js
// -------------------------------------------------------------
// TRACKING APP SERVER - with better-sqlite3 database integration
// -------------------------------------------------------------

const express = require('express');
const fetch = require('node-fetch'); // npm i node-fetch@2
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// ---------- DATABASE SETUP ----------
let db;
try {
  const Database = require('better-sqlite3');
  db = new Database(path.join(__dirname, 'devices.db'));

  db.prepare(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deviceId TEXT,
      label TEXT,
      publicIP TEXT,
      clientLat REAL,
      clientLon REAL,
      reportedAt TEXT
    )
  `).run();

  console.log("✅ Database initialized successfully.");
} catch (err) {
  console.error("❌ Database initialization failed:", err);
}

// ---------- APP SETUP ----------
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // serve index.html, tracker.html, etc.

const PORT = process.env.PORT || 3000;

// In-memory store (for live session)
let devices = {}; // key: deviceId, value: { deviceId, label, lat, lon, etc. }

// ---------- HELPER: IP GEOLOCATION ----------
async function geoip(ip) {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,lat,lon,timezone,isp,query`
    );
    return await res.json();
  } catch (err) {
    return { status: 'fail', message: err.message };
  }
}

// ---------- ROUTES ----------

// 🛰️ Device reporting endpoint
app.post('/report', async (req, res) => {
  const { deviceId, label, clientLat, clientLon, publicIP } = req.body;
  const reportedAt = new Date().toISOString();

  // Save in memory
  devices[deviceId] = { deviceId, label, clientLat, clientLon, publicIP, reportedAt };

  // Save in database (if DB initialized)
  try {
    const insert = db.prepare(`
      INSERT INTO devices (deviceId, label, publicIP, clientLat, clientLon, reportedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insert.run(deviceId, label, publicIP, clientLat, clientLon, reportedAt);
  } catch (err) {
    console.error("DB insert error:", err.message);
  }

  res.json({ ok: true });
});

// 🗺️ Return all current (live) devices
app.get('/devices', (req, res) => {
  res.json(Object.values(devices));
});

// 🔍 Return one specific device (live memory only)
app.get('/devices/:id', (req, res) => {
  const id = req.params.id;
  if (!devices[id]) return res.status(404).json({ error: 'Device not found' });
  res.json(devices[id]);
});

// 📜 Return all stored devices from the database
app.get('/history', (req, res) => {
  try {
    const rows = db
      .prepare(`SELECT * FROM devices ORDER BY reportedAt DESC`)
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
});

// 🧹 Reset in-memory live devices (does NOT touch DB)
app.post('/reset', (req, res) => {
  devices = {};
  res.json({ ok: true, message: "All live devices cleared (DB history preserved)." });
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
