/**
 * FeedstockMatch — Matching Engine
 *
 * Scores feedstock↔processor compatibility and produces ranked matches.
 */

import { v4 as uuid } from "uuid";
import type {
  Feedstock,
  Processor,
  Match,
  ContaminationRisk,
  SafetyChecklistItem,
  CheckStatus,
  ScenarioParams,
  TransportEstimate,
} from "../models/types.js";
import { calculateLCA } from "./lca-engine.js";
import { calculateDistance, estimateRoute } from "./routing.js";

// ── Default scenario ──────────────────────────────────────────────────

const DEFAULT_SCENARIO: ScenarioParams = {
  transportMode: "truck_avg",
  maxDistanceKm: 200,
  baselineScenario: "landfill_gas_capture",
  fugitiveLeakRatePct: 2,
  gridEmissionFactor: 0.4,
  includeAvoidedEmissions: true,
  uncertaintyMethod: "deterministic",
};

// ── Compatibility scoring ─────────────────────────────────────────────

interface CompatibilityResult {
  score: number; // 0–100
  factors: Record<string, number>; // individual factor scores
  contaminationRisk: ContaminationRisk;
  reasons: string[];
}

function scoreCompatibility(
  feedstock: Feedstock,
  processor: Processor,
  distanceKm: number,
  maxDistanceKm: number
): CompatibilityResult {
  const factors: Record<string, number> = {};
  const reasons: string[] = [];

  // 1. Category match (0 or 25 points)
  if (processor.acceptedCategories.includes(feedstock.category)) {
    factors.category = 25;
  } else {
    factors.category = 0;
    reasons.push(`Processor does not accept ${feedstock.category}`);
  }

  // 2. Subtype match (0 or 15 points)
  if (processor.acceptedSubtypes.includes(feedstock.subtype)) {
    factors.subtype = 15;
  } else {
    factors.subtype = 0;
    reasons.push(`Processor does not accept subtype ${feedstock.subtype}`);
  }

  // 3. Composition fit (0–25 points)
  const comp = feedstock.composition;
  const tol = processor.compositionTolerance;
  let compositionScore = 0;

  // Moisture
  if (comp.moisturePct >= tol.moistureRange[0] && comp.moisturePct <= tol.moistureRange[1]) {
    compositionScore += 10;
  } else {
    const deviation = Math.min(
      Math.abs(comp.moisturePct - tol.moistureRange[0]),
      Math.abs(comp.moisturePct - tol.moistureRange[1])
    );
    compositionScore += Math.max(0, 10 - deviation * 0.5);
    reasons.push(`Moisture ${comp.moisturePct}% outside range [${tol.moistureRange.join("–")}%]`);
  }

  // C:N ratio
  if (comp.cnRatio >= tol.cnRange[0] && comp.cnRatio <= tol.cnRange[1]) {
    compositionScore += 10;
  } else {
    const deviation = Math.min(
      Math.abs(comp.cnRatio - tol.cnRange[0]),
      Math.abs(comp.cnRatio - tol.cnRange[1])
    );
    compositionScore += Math.max(0, 10 - deviation * 0.3);
    reasons.push(`C:N ratio ${comp.cnRatio} outside range [${tol.cnRange.join("–")}]`);
  }

  // pH (if both have it)
  if (comp.ph !== undefined && tol.phRange) {
    if (comp.ph >= tol.phRange[0] && comp.ph <= tol.phRange[1]) {
      compositionScore += 5;
    } else {
      reasons.push(`pH ${comp.ph} outside range [${tol.phRange.join("–")}]`);
    }
  } else {
    compositionScore += 5; // no pH data = assume OK
  }

  factors.composition = Math.round(compositionScore);

  // 4. Distance score (0–20 points)
  if (distanceKm <= maxDistanceKm) {
    factors.distance = Math.round(20 * (1 - distanceKm / maxDistanceKm));
  } else {
    factors.distance = 0;
    reasons.push(`Distance ${distanceKm} km exceeds max ${maxDistanceKm} km`);
  }

  // 5. Capacity utilization (0–15 points) — prefer processors with available capacity
  const availableCapacity = processor.intakeCapacityTonnesPerMonth * (1 - processor.currentUtilizationPct / 100);
  if (availableCapacity >= feedstock.volumeTonnesPerMonth) {
    factors.capacity = 15;
  } else if (availableCapacity > 0) {
    factors.capacity = Math.round(15 * (availableCapacity / feedstock.volumeTonnesPerMonth));
    reasons.push(`Processor can only absorb ${Math.round(availableCapacity)} of ${feedstock.volumeTonnesPerMonth} tonnes/month`);
  } else {
    factors.capacity = 0;
    reasons.push("Processor at full capacity");
  }

  // Total score
  const score = Math.min(100, Object.values(factors).reduce((a, b) => a + b, 0));

  // Contamination risk assessment
  const contaminationRisk = assessContaminationRisk(feedstock, processor);

  return { score, factors, contaminationRisk, reasons };
}

// ── Contamination risk ────────────────────────────────────────────────

function assessContaminationRisk(
  feedstock: Feedstock,
  processor: Processor
): ContaminationRisk {
  const flags = feedstock.contaminationFlags;
  const prohibited = processor.compositionTolerance.prohibitedSubstances;

  // Hard reject: known heavy metals + processor prohibits them
  if (flags.heavyMetals && prohibited.includes("heavy_metals")) {
    return "REJECT";
  }

  // High risk: pathogens present and processor is composting (needs validated time-temp)
  if (flags.pathogens && processor.technology.startsWith("composting")) {
    return "HIGH";
  }

  // High risk: any flagged contaminant that is prohibited
  if (flags.other?.some((c) => prohibited.includes(c))) {
    return "REJECT";
  }

  // Medium risk: plastic fragments or pesticide residue present
  if (flags.plasticFragments || flags.pesticideResidue) {
    return "MEDIUM";
  }

  // Low risk
  return "LOW";
}

// ── Safety checklist generator ────────────────────────────────────────

function generateSafetyChecklist(
  feedstock: Feedstock,
  processor: Processor,
  contaminationRisk: ContaminationRisk
): SafetyChecklistItem[] {
  const items: SafetyChecklistItem[] = [
    {
      id: uuid(),
      description: "Feedstock composition within processor tolerance ranges",
      status: "NEEDS_REVIEW" as CheckStatus,
      requiredForRiskLevel: ["LOW", "MEDIUM", "HIGH"],
    },
    {
      id: uuid(),
      description: "No prohibited contaminants flagged",
      status: contaminationRisk === "REJECT" ? "FAIL" : "NEEDS_REVIEW",
      requiredForRiskLevel: ["LOW", "MEDIUM", "HIGH"],
    },
    {
      id: uuid(),
      description: "Lab certification uploaded (if required by risk level)",
      status: contaminationRisk === "HIGH" || contaminationRisk === "REJECT" ? "NEEDS_REVIEW" : "NOT_APPLICABLE",
      requiredForRiskLevel: ["HIGH"],
    },
    {
      id: uuid(),
      description: "Transport permits verified for jurisdiction",
      status: "NEEDS_REVIEW",
      requiredForRiskLevel: ["LOW", "MEDIUM", "HIGH"],
    },
    {
      id: uuid(),
      description: "Processor intake permit covers feedstock type",
      status: "NEEDS_REVIEW",
      requiredForRiskLevel: ["LOW", "MEDIUM", "HIGH"],
    },
    {
      id: uuid(),
      description: "Insurance/liability coverage confirmed",
      status: "NEEDS_REVIEW",
      requiredForRiskLevel: ["MEDIUM", "HIGH"],
    },
    {
      id: uuid(),
      description: "Seasonal variation within processor buffer capacity",
      status: feedstock.seasonalProfile ? "NEEDS_REVIEW" : "NOT_APPLICABLE",
      requiredForRiskLevel: ["LOW", "MEDIUM", "HIGH"],
    },
  ];

  // Add pathogen-specific check for composting
  if (feedstock.contaminationFlags.pathogens && processor.technology.startsWith("composting")) {
    items.push({
      id: uuid(),
      description: "Time-temperature pathogen reduction log available (PFRP validation)",
      status: "NEEDS_REVIEW",
      requiredForRiskLevel: ["HIGH"],
    });
  }

  return items;
}

// ── Main matching function ────────────────────────────────────────────

export interface ComputeMatchOptions {
  feedstock: Feedstock;
  processor: Processor;
  volumeTonnesOverride?: number;
  scenario?: Partial<ScenarioParams>;
}

/**
 * Compute a match between a feedstock and a processor.
 * Returns the full Match object with scores, LCA, and safety checklist.
 */
export async function computeMatch(options: ComputeMatchOptions): Promise<Match> {
  const { feedstock, processor, volumeTonnesOverride } = options;
  const scenario: ScenarioParams = { ...DEFAULT_SCENARIO, ...options.scenario };

  // Calculate distance
  const routeResult = await estimateRoute(feedstock.location, processor.location);
  const distanceKm = routeResult.distanceKm;

  // Score compatibility
  const compat = scoreCompatibility(feedstock, processor, distanceKm, scenario.maxDistanceKm);

  // Volume
  const volumeTonnes = volumeTonnesOverride ?? feedstock.volumeTonnesPerMonth;

  // Transport estimate
  const transport: TransportEstimate = {
    distanceKm,
    mode: scenario.transportMode,
    co2eKg: 0, // filled by LCA
    routeSource: routeResult.source,
    durationMinutes: routeResult.durationMinutes,
  };

  // LCA calculation
  const lca = calculateLCA({
    feedstock,
    processor,
    distanceKm,
    volumeTonnes,
    scenario,
  });
  transport.co2eKg = lca.transportEmissionsKg;

  // Safety checklist
  const safetyChecklist = generateSafetyChecklist(feedstock, processor, compat.contaminationRisk);

  const now = new Date().toISOString();

  const match: Match = {
    id: uuid(),
    feedstockId: feedstock.id,
    processorId: processor.id,
    feedstockOwnerId: feedstock.ownerId,
    processorOwnerId: processor.ownerId,
    compatibilityScore: compat.score,
    contaminationRisk: compat.contaminationRisk,
    transport,
    lca,
    safetyChecklist,
    volumeTonnesProposed: volumeTonnes,
    status: "computed",
    statusHistory: [{ status: "computed", timestamp: now, actor: "system" }],
    createdAt: now,
    updatedAt: now,
  };

  return match;
}

/**
 * Find and rank all potential matches for a feedstock against all processors.
 */
export async function findMatches(
  feedstock: Feedstock,
  processors: Processor[],
  scenario?: Partial<ScenarioParams>
): Promise<Match[]> {
  const mergedScenario: ScenarioParams = { ...DEFAULT_SCENARIO, ...scenario };

  // Pre-filter by distance (Haversine) to avoid computing LCA for far-away processors
  const candidates = processors.filter((p) => {
    if (p.status !== "active") return false;
    const dist = calculateDistance(feedstock.location, p.location);
    return dist <= mergedScenario.maxDistanceKm;
  });

  // Compute matches in parallel
  const matches = await Promise.all(
    candidates.map((processor) =>
      computeMatch({ feedstock, processor, scenario })
    )
  );

  // Sort by compatibility score descending
  return matches
    .filter((m) => m.contaminationRisk !== "REJECT")
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}
