/**
 * FeedstockMatch — Express Server
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./api/routes.js";
import { seedDemoData } from "./services/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Middleware ─────────────────────────────────────────────────────────

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS for development
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-User-Id");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// ── Static files ──────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, "..", "public")));

// ── API routes ────────────────────────────────────────────────────────

app.use("/api", router);

// ── SPA fallback ──────────────────────────────────────────────────────

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────

async function start() {
  // Seed demo data
  await seedDemoData();
  console.log("[FeedstockMatch] Demo data seeded");

  app.listen(PORT, () => {
    console.log(`[FeedstockMatch] Server running on http://localhost:${PORT}`);
    console.log(`[FeedstockMatch] API available at http://localhost:${PORT}/api`);
  });
}

start().catch(console.error);
