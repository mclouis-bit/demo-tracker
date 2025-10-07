// server.js
// -------------------------------------------------------------
// TRACKING APP SERVER - MySQL Version (Render compatible)
// -------------------------------------------------------------

const express = require("express");
const fetch = require("node-fetch"); // npm i node-fetch@2
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise"); // npm i mysql2

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public")); // serve index.html, tracker.html, etc.

const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// DATABASE SETUP (MySQL)
// -------------------------------------------------------------
let db;

async function initDB() {
  try {
    db = await mysql.createConnection({
      host: process.env.MYSQL_HOST || "localhost",
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DB || "tracking_app",
    });

    await db.execute(`
      CREATE TABLE IF NOT EXISTS devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        deviceId VARCHAR(255),
        label VARCHAR(255),
        publicIP VARCHAR(50),
        clientLat DOUBLE,
        clientLon DOUBLE,
        reportedAt DATETIME
      )
    `);

    console.log("✅ MySQL Database connected and initialized.");
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
    db = null;
  }
}

// Initialize the DB when server starts
initDB();

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

  // Save in MySQL database (if available)
  if (db) {
    try {
      await db.execute(
        `INSERT INTO devices (deviceId, label, publicIP, clientLat, clientLon, reportedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [deviceId, label, publicIP, clientLat, clientLon, reportedAt]
      );
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

// 📜 Return all stored devices from MySQL (if connected)
app.get("/history", async (req, res) => {
  if (!db)
    return res.status(503).json({ error: "Database not connected." });

  try {
    const [rows] = await db.execute(
      "SELECT * FROM devices ORDER BY reportedAt DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database query failed", details: err.message });
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
// -------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
