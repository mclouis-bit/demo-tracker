// server.js
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
  const { deviceId, label } = req.body;
  // get reporter IP (public IP as seen by server)
  const reporterIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  // if IPv6 format like ::ffff:41.23. etc, normalize
  const ip = reporterIP.replace(/^::ffff:/, '');
  const clientLat = req.body.clientLat || null;
  const clientLon = req.body.clientLon || null;

  const ipinfo = await geoip(ip);

  const entry = {
    deviceId: deviceId || `dev-${Date.now()}`,
    label: label || null,
    reportedAt: new Date().toISOString(),
    publicIP: ip,
    clientLat,
    clientLon,
    geoip: ipinfo
  };
  devices[entry.deviceId] = entry;

  res.json({ ok: true, entry });
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

// Simple static file serve for demo pages (index.html, tracker.html, about.html)
app.use(express.static('public'));

app.post('/reset', (req, res) => {
  devices = {};
  res.json({ ok: true, message: "All devices cleared." });
});


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
