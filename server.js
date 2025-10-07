// server.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./devices.db');

// Create table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT,
    label TEXT,
    publicIP TEXT,
    clientLat REAL,
    clientLon REAL,
    reportedAt TEXT
  )
`);


const express = require('express');
const fetch = require('node-fetch'); // npm i node-fetch@2
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;

// In-memory store (for demo). For real use, persist to DB or file.
let devices = {}; // key: deviceId, value: { lastSeen, report, geoip }

// Helper: query ip-api (server-side)
async function geoip(ip) {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,lat,lon,timezone,isp,query`);
    return await res.json();
  } catch (err) {
    return { status: 'fail', message: err.message };
  }
}

// Endpoint for remote device to POST its info
// payload: { deviceId, label (optional), clientLat, clientLon }
app.post('/report', async (req, res) => {
  const { deviceId, label, clientLat, clientLon, publicIP } = req.body;
  const reportedAt = new Date().toISOString();

  // Save in memory
  devices[deviceId] = { deviceId, label, clientLat, clientLon, publicIP, reportedAt };

  // Save in database
  db.run(
    `INSERT INTO devices (deviceId, label, publicIP, clientLat, clientLon, reportedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [deviceId, label, publicIP, clientLat, clientLon, reportedAt],
    (err) => {
      if (err) console.error("DB insert error:", err.message);
    }
  );

  res.json({ ok: true });
});


// Return all devices
app.get('/devices', (req, res) => {
  // return array
  res.json(Object.values(devices));
});

// Return one device
app.get('/devices/:id', (req, res) => {
  const id = req.params.id;
  if (!devices[id]) return res.status(404).json({ error: 'not found' });
  res.json(devices[id]);
});

// Get all stored devices from DB (history)
app.get('/history', (req, res) => {
  db.all(`SELECT * FROM devices ORDER BY reportedAt DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});


// Simple static file serve for demo pages (index.html, tracker.html, about.html)
app.use(express.static('public'));

app.post('/reset', (req, res) => {
  devices = {};
  res.json({ ok: true, message: "All devices cleared." });
});


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
