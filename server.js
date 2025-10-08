// server.js
// -------------------------------------------------------------
// TRACKING APP SERVER - PostgreSQL Version (Render compatible)
// -------------------------------------------------------------

const express = require("express");
const fetch = require("node-fetch"); // npm i node-fetch@2
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg"); // npm i pg

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// DATABASE SETUP (PostgreSQL)
// -------------------------------------------------------------
let pool;

async function initDB() {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        deviceId TEXT,
        label TEXT,
        publicIP TEXT,
        clientLat DOUBLE PRECISION,
        clientLon DOUBLE PRECISION,
        reportedAt TIMESTAMP
      )
    `);

    console.log("✅ PostgreSQL Database connected and initialized.");
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
    pool = null;
  }
}

initDB();

// -------------------------------------------------------------
// IN-MEMORY STORE (for live tracking)
// -------------------------------------------------------------
let devices = {};

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------
app.post("/report", async (req, res) => {
  const { deviceId, label, clientLat, clientLon, publicIP } = req.body;
  const reportedAt = new Date().toISOString();

  devices[deviceId] = {
    deviceId,
    label,
    clientLat,
    clientLon,
    publicIP,
    reportedAt,
  };

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO devices (deviceId, label, publicIP, clientLat, clientLon, reportedAt)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deviceId, label, publicIP, clientLat, clientLon, reportedAt]
      );
    } catch (err) {
      console.error("DB insert error:", err.message);
    }
  }

  res.json({ ok: true });
});

app.get("/devices", (req, res) => {
  res.json(Object.values(devices));
});

app.get("/devices/:id", (req, res) => {
  const id = req.params.id;
  if (!devices[id]) return res.status(404).json({ error: "Device not found" });
  res.json(devices[id]);
});

app.get("/history", async (req, res) => {
  if (!pool)
    return res.status(503).json({ error: "Database not connected." });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM devices ORDER BY reportedAt DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Query failed", details: err.message });
  }
});

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
