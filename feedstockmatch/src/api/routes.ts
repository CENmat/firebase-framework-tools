/**
 * FeedstockMatch — API Routes
 */

import { Router, type Request, type Response } from "express";
import {
  createFeedstockSchema,
  updateFeedstockSchema,
  createProcessorSchema,
  updateProcessorSchema,
  computeMatchSchema,
  scenarioParamsSchema,
} from "../models/validation.js";
import {
  createFeedstock,
  getFeedstock,
  listFeedstocks,
  updateFeedstock,
  archiveFeedstock,
  createProcessor,
  getProcessor,
  listProcessors,
  updateProcessor,
  archiveProcessor,
  saveMatch,
  getMatch,
  listMatches,
  updateMatchStatus,
} from "../services/store.js";
import { computeMatch, findMatches } from "../services/matching-engine.js";
import { calculateLCA, getEmissionFactorTables } from "../services/lca-engine.js";
import { getAuditTrail, getAllAuditEntries, exportAuditCSV, verifyChainIntegrity } from "../services/audit.js";
import { getResidueEstimates, getResidueRatios, FAOSTAT_INTEGRATION_PLAN } from "../services/faostat.js";
import { generateHeatmap } from "../services/heatmap.js";

export const router = Router();

// ── Health ────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "feedstockmatch", version: "1.0.0-mvp", timestamp: new Date().toISOString() });
});

// ── Feedstocks ────────────────────────────────────────────────────────

router.post("/feedstocks", async (req: Request, res: Response) => {
  const parsed = createFeedstockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const ownerId = (req.headers["x-user-id"] as string) || "anonymous";
  const feedstock = await createFeedstock(parsed.data, ownerId);
  res.status(201).json(feedstock);
});

router.get("/feedstocks", (req: Request, res: Response) => {
  const filters = {
    category: req.query.category as string | undefined,
    region: req.query.region as string | undefined,
    status: (req.query.status as string) || "active",
  };
  res.json(listFeedstocks(filters));
});

router.get("/feedstocks/:id", (req: Request, res: Response) => {
  const feedstock = getFeedstock(req.params.id);
  if (!feedstock) {
    res.status(404).json({ error: "Feedstock not found" });
    return;
  }
  res.json(feedstock);
});

router.put("/feedstocks/:id", async (req: Request, res: Response) => {
  const parsed = updateFeedstockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const actor = (req.headers["x-user-id"] as string) || "anonymous";
  const updated = await updateFeedstock(req.params.id, parsed.data, actor);
  if (!updated) {
    res.status(404).json({ error: "Feedstock not found" });
    return;
  }
  res.json(updated);
});

router.delete("/feedstocks/:id", async (req: Request, res: Response) => {
  const actor = (req.headers["x-user-id"] as string) || "anonymous";
  const success = await archiveFeedstock(req.params.id, actor);
  if (!success) {
    res.status(404).json({ error: "Feedstock not found" });
    return;
  }
  res.status(204).send();
});

// ── Processors ────────────────────────────────────────────────────────

router.post("/processors", async (req: Request, res: Response) => {
  const parsed = createProcessorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const ownerId = (req.headers["x-user-id"] as string) || "anonymous";
  const processor = await createProcessor(parsed.data, ownerId);
  res.status(201).json(processor);
});

router.get("/processors", (req: Request, res: Response) => {
  const filters = {
    technology: req.query.technology as string | undefined,
    region: req.query.region as string | undefined,
    status: (req.query.status as string) || "active",
  };
  res.json(listProcessors(filters));
});

router.get("/processors/:id", (req: Request, res: Response) => {
  const processor = getProcessor(req.params.id);
  if (!processor) {
    res.status(404).json({ error: "Processor not found" });
    return;
  }
  res.json(processor);
});

router.put("/processors/:id", async (req: Request, res: Response) => {
  const parsed = updateProcessorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const actor = (req.headers["x-user-id"] as string) || "anonymous";
  const updated = await updateProcessor(req.params.id, parsed.data, actor);
  if (!updated) {
    res.status(404).json({ error: "Processor not found" });
    return;
  }
  res.json(updated);
});

router.delete("/processors/:id", async (req: Request, res: Response) => {
  const actor = (req.headers["x-user-id"] as string) || "anonymous";
  const success = await archiveProcessor(req.params.id, actor);
  if (!success) {
    res.status(404).json({ error: "Processor not found" });
    return;
  }
  res.status(204).send();
});

// ── Matching ──────────────────────────────────────────────────────────

router.get("/matches", (req: Request, res: Response) => {
  const userId = (req.headers["x-user-id"] as string) || "anonymous";
  const filters = {
    feedstockOwnerId: req.query.role === "supplier" ? userId : undefined,
    processorOwnerId: req.query.role === "processor" ? userId : undefined,
    status: req.query.status as string | undefined,
  };
  res.json(listMatches(filters));
});

router.post("/matches/compute", async (req: Request, res: Response) => {
  const parsed = computeMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  const feedstock = getFeedstock(parsed.data.feedstockId);
  if (!feedstock) {
    res.status(404).json({ error: "Feedstock not found" });
    return;
  }

  const processor = getProcessor(parsed.data.processorId);
  if (!processor) {
    res.status(404).json({ error: "Processor not found" });
    return;
  }

  const match = await computeMatch({
    feedstock,
    processor,
    volumeTonnesOverride: parsed.data.volumeTonnes,
    scenario: parsed.data.scenarioOverrides,
  });

  await saveMatch(match);
  res.status(201).json(match);
});

router.post("/matches/find", async (req: Request, res: Response) => {
  const feedstockId = req.body.feedstockId as string;
  if (!feedstockId) {
    res.status(400).json({ error: "feedstockId is required" });
    return;
  }

  const feedstock = getFeedstock(feedstockId);
  if (!feedstock) {
    res.status(404).json({ error: "Feedstock not found" });
    return;
  }

  const allProcessors = listProcessors({ status: "active" });
  const matches = await findMatches(feedstock, allProcessors, req.body.scenario);

  // Save all matches
  for (const match of matches) {
    await saveMatch(match);
  }

  res.json(matches);
});

router.get("/matches/:id", (req: Request, res: Response) => {
  const match = getMatch(req.params.id);
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(match);
});

router.post("/matches/:id/accept", async (req: Request, res: Response) => {
  const actor = (req.headers["x-user-id"] as string) || "anonymous";
  const updated = await updateMatchStatus(req.params.id, "accepted", actor);
  if (!updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(updated);
});

router.post("/matches/:id/reject", async (req: Request, res: Response) => {
  const actor = (req.headers["x-user-id"] as string) || "anonymous";
  const updated = await updateMatchStatus(req.params.id, "rejected", actor);
  if (!updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(updated);
});

// ── Impact / LCA ──────────────────────────────────────────────────────

router.get("/impact/:matchId", (req: Request, res: Response) => {
  const match = getMatch(req.params.matchId);
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json({
    matchId: match.id,
    lca: match.lca,
    transport: match.transport,
    contaminationRisk: match.contaminationRisk,
    safetyChecklist: match.safetyChecklist,
  });
});

router.post("/impact/scenario", async (req: Request, res: Response) => {
  const { feedstockId, processorId, scenario } = req.body;

  const feedstock = getFeedstock(feedstockId);
  if (!feedstock) {
    res.status(404).json({ error: "Feedstock not found" });
    return;
  }

  const processor = getProcessor(processorId);
  if (!processor) {
    res.status(404).json({ error: "Processor not found" });
    return;
  }

  const parsedScenario = scenarioParamsSchema.safeParse(scenario || {});
  if (!parsedScenario.success) {
    res.status(400).json({ error: "Invalid scenario params", details: parsedScenario.error.issues });
    return;
  }

  const match = await computeMatch({
    feedstock,
    processor,
    scenario: parsedScenario.data,
  });

  res.json({
    scenario: parsedScenario.data,
    lca: match.lca,
    transport: match.transport,
    compatibilityScore: match.compatibilityScore,
    contaminationRisk: match.contaminationRisk,
  });
});

router.get("/impact/methodology", (_req: Request, res: Response) => {
  res.json({
    description: "FeedstockMatch LCA methodology — all emission factors with sources",
    factors: getEmissionFactorTables(),
    systemBoundary: "Cradle-to-gate: feedstock generation → collection/transport → processing → output",
    uncertaintyMethod: "±30% deterministic range (default) or Monte Carlo simulation",
    references: [
      "EPA WARM v16",
      "IPCC 2006 Guidelines for National GHG Inventories",
      "IPCC 2019 Refinement",
      "GLEC Framework v3.0",
      "GREET 2024 (Argonne National Lab)",
      "ecoinvent 3.9",
      "IEA Emission Factors by Country (2024)",
    ],
  });
});

// ── Audit ─────────────────────────────────────────────────────────────

router.get("/audit/:entityId", (req: Request, res: Response) => {
  const entries = getAuditTrail(req.params.entityId);
  res.json(entries);
});

router.get("/audit", (req: Request, res: Response) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  res.json(getAllAuditEntries(offset, limit));
});

router.get("/audit/export", (req: Request, res: Response) => {
  const format = req.query.format || "json";
  const { entries } = getAllAuditEntries(0, 10000);

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=audit-trail.csv");
    res.send(exportAuditCSV(entries));
  } else {
    res.json(entries);
  }
});

router.get("/audit/verify", async (_req: Request, res: Response) => {
  const result = await verifyChainIntegrity();
  res.json(result);
});

// ── FAOSTAT Data ──────────────────────────────────────────────────────

router.get("/data/faostat/residues", (req: Request, res: Response) => {
  const country = req.query.country as string | undefined;
  res.json({
    estimates: getResidueEstimates(country),
    integrationPlan: FAOSTAT_INTEGRATION_PLAN,
    note: "MVP uses curated static dataset. Production will sync quarterly from FAOSTAT API.",
  });
});

router.get("/data/faostat/rpr", (_req: Request, res: Response) => {
  res.json({
    ratios: getResidueRatios(),
    description: "Residue-to-Product Ratios (RPR) used for estimating available residues from crop production data",
  });
});

// ── Heatmap ───────────────────────────────────────────────────────────

router.get("/data/heatmap", (req: Request, res: Response) => {
  const cellSize = parseFloat(req.query.cellSize as string) || 0.5;
  const feedstocks = listFeedstocks({ status: "active" });
  const processors = listProcessors({ status: "active" });
  const cells = generateHeatmap(feedstocks, processors, cellSize);
  res.json({
    cellSizeDeg: cellSize,
    cells,
    legend: {
      surplus_positive: "More supply than demand (green — feedstock available)",
      surplus_negative: "More demand than supply (orange — processor capacity available)",
      surplus_zero: "Balanced (neutral)",
    },
  });
});
