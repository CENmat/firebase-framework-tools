/**
 * FeedstockMatch — Deployment & Infrastructure Configuration
 *
 * This file documents the production deployment architecture.
 * MVP runs as a single Express server; production uses Firebase App Hosting.
 */

export const DEPLOYMENT_CONFIG = {
  // ── MVP (current) ──────────────────────────────────────────────
  mvp: {
    runtime: "Node.js 20+",
    server: "Express 4.x on single process",
    database: "In-memory (Map-based store)",
    hosting: "Local development / any Node.js host",
    routing: "OSRM public demo server (rate-limited)",
    auth: "Header-based X-User-Id (no auth for MVP)",
    cost: "$0 (runs locally)",
  },

  // ── Production ─────────────────────────────────────────────────
  production: {
    compute: {
      service: "Firebase App Hosting (Cloud Run)",
      scaling: "0 → 10 instances, 1 vCPU / 512MB each",
      coldStart: "~2s with pre-warmed instances",
    },
    database: {
      primary: "Cloud SQL PostgreSQL 15 + PostGIS 3.4",
      instance: "db-f1-micro (MVP) → db-custom-2-4096 (growth)",
      backup: "Automated daily backups, 7-day retention",
      auditTable: "Append-only with row-level triggers preventing UPDATE/DELETE",
    },
    cache: {
      service: "Memorystore for Redis",
      size: "1 GB (basic tier)",
      usage: "Session cache, rate limiting, hot match results",
    },
    routing: {
      service: "Self-hosted OSRM on Cloud Run",
      data: "Geofabrik OSM extracts (North America, Europe)",
      fallback: "Haversine × 1.3 detour factor",
    },
    auth: {
      service: "Firebase Authentication",
      methods: ["Email/password", "Google SSO", "Enterprise SAML"],
    },
    storage: {
      service: "Cloud Storage",
      usage: "Lab certificates, audit archive exports, report PDFs",
    },
    monitoring: {
      apm: "Cloud Trace + Cloud Logging",
      alerts: "Error rate > 1%, latency p95 > 2s, audit chain break",
      uptime: "Cloud Monitoring uptime checks, 1-min intervals",
    },
    cdn: {
      service: "Firebase Hosting CDN",
      assets: "Static frontend (HTML, CSS, JS), immutable hashed bundles",
    },
  },

  // ── Cost Estimate (monthly) ────────────────────────────────────
  costEstimate: {
    cloudRun: "$15–$50 (based on traffic, scale-to-zero)",
    cloudSQL: "$25 (db-f1-micro) → $80 (db-custom-2-4096)",
    redis: "$35 (1GB basic)",
    osrmInstance: "$15–$30 (Cloud Run, on-demand)",
    storage: "$5",
    firebaseAuth: "$0 (up to 50K MAU)",
    firebaseHosting: "$0 (up to 10GB transfer)",
    total_mvp: "$95–$155/month",
    total_growth: "$155–$300/month",
    breakeven: "~200 Operator accounts ($149/mo) or ~60 Enterprise ($499/mo)",
  },
} as const;
