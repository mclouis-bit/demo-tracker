// server.js
// -------------------------------------------------------------
// TRACKING APP SERVER - Safe version with optional database
// -------------------------------------------------------------

const express = require("express");
const fetch = require("node-fetch"); // npm i node-fetch@2
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public")); // serve index.html, tracker.html, etc.

const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// DATABASE SETUP (optional)
// -------------------------------------------------------------
let db = null;
try {
  const Database = require("better-sqlite3");
  db = new Database(path.join(__dirname, "devices.db"));

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
  console.warn("⚠️ Database unavailable — running in memory-only mode:", err.message);
}

// -------------------------------------------------------------
// IN-MEMORY STORE (for live session)
// -------------------------------------------------------------
let devices = {}; // key: deviceId → live data

// -------------------------------------------------------------
// HELPER: IP GEOLOCATION
// -------------------------------------------------------------
async function geoip(ip) {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,lat,lon,timezone,isp,query`
    );
    return await res.json();
  } catch (err) {
    return { status: "fail", message: err.message };
  }
}

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// 🛰️ Device reporting endpoint
app.post("/report", async (req, res) => {
  const { deviceId, label, clientLat, clientLon, publicIP } = req.body;
  const reportedAt = new Date().toISOString();

  // Save in memory (for live dashboard)
  devices[deviceId] = {
    deviceId,
    label,
    clientLat,
    clientLon,
    publicIP,
    reportedAt,
  };

  // Save in database (if available)
  if (db) {
    try {
      db.prepare(
        `INSERT INTO devices (deviceId, label, publicIP, clientLat, clientLon, reportedAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(deviceId, label, publicIP, clientLat, clientLon, reportedAt);
    } catch (err) {
      console.error("DB insert error:", err.message);
    }
  }

  res.json({ ok: true });
});

// 🗺️ Return all current (live) devices
app.get("/devices", (req, res) => {
  res.json(Object.values(devices));
});

// 🔍 Return one specific live device
app.get("/devices/:id", (req, res) => {
  const id = req.params.id;
  if (!devices[id]) return res.status(404).json({ error: "Device not found" });
  res.json(devices[id]);
});

// 📜 Return all stored devices from database (if available)
app.get("/history", (req, res) => {
  if (!db) {
    return res.status(503).json({
      error: "Database not available on this server instance.",
    });
  }

  try {
    const rows = db
      .prepare("SELECT * FROM devices ORDER BY reportedAt DESC")
      .all();
    res.json(rows);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Database query failed", details: err.message });
  }
});

// 🧹 Reset live in-memory devices (DB history stays)
app.post("/reset", (req, res) => {
  devices = {};
  res.json({
    ok: true,
    message: "All live devices cleared (DB history preserved).",
  });
});

// -------------------------------------------------------------
// START SERVER
// --------
