// server.js
const Database = require('better-sqlite3');
const db = new Database('./devices.db');

// Create table if it doesn’t exist
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

const insert = db.prepare(`
  INSERT INTO devices (deviceId, label, publicIP, clientLat, clientLon, reportedAt)
  VALUES (?, ?, ?, ?, ?, ?)
`);
insert.run(deviceId, label, publicIP, clientLat, clientLon, reportedAt);


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
  const rows = db.prepare(`SELECT * FROM devices ORDER BY reportedAt DESC`).all();
res.json(rows);
});


// Simple static file serve for demo pages (index.html, tracker.html, about.html)
app.use(express.static('public'));

app.post('/reset', (req, res) => {
  devices = {};
  res.json({ ok: true, message: "All devices cleared." });
});


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
