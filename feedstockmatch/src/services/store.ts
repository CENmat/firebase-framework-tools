/**
 * FeedstockMatch — In-Memory Data Store (MVP)
 *
 * In production, this is replaced by PostgreSQL + PostGIS.
 * This module provides the same interface for MVP development.
 */

import { v4 as uuid } from "uuid";
import type { Feedstock, Processor, Match } from "../models/types.js";
import type { CreateFeedstockInput, CreateProcessorInput } from "../models/validation.js";
import { appendAuditEntry } from "./audit.js";

// ── Storage ───────────────────────────────────────────────────────────

const feedstocks = new Map<string, Feedstock>();
const processors = new Map<string, Processor>();
const matches = new Map<string, Match>();

// ── Feedstock CRUD ────────────────────────────────────────────────────

export async function createFeedstock(input: CreateFeedstockInput, ownerId: string): Promise<Feedstock> {
  const now = new Date().toISOString();
  const feedstock: Feedstock = {
    id: uuid(),
    ownerId,
    ...input,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  feedstocks.set(feedstock.id, feedstock);

  await appendAuditEntry({
    actor: ownerId,
    action: "FEEDSTOCK_CREATED",
    entityType: "feedstock",
    entityId: feedstock.id,
    previousValue: null,
    newValue: feedstock,
    reason: "New feedstock listing created",
  });

  return feedstock;
}

export function getFeedstock(id: string): Feedstock | undefined {
  return feedstocks.get(id);
}

export function listFeedstocks(filters?: {
  category?: string;
  region?: string;
  status?: string;
}): Feedstock[] {
  let results = Array.from(feedstocks.values());
  if (filters?.category) results = results.filter((f) => f.category === filters.category);
  if (filters?.region) results = results.filter((f) => f.region === filters.region);
  if (filters?.status) results = results.filter((f) => f.status === filters.status);
  return results;
}

export async function updateFeedstock(
  id: string,
  updates: Partial<CreateFeedstockInput>,
  actor: string
): Promise<Feedstock | undefined> {
  const existing = feedstocks.get(id);
  if (!existing) return undefined;

  const updated: Feedstock = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  feedstocks.set(id, updated);

  await appendAuditEntry({
    actor,
    action: "FEEDSTOCK_UPDATED",
    entityType: "feedstock",
    entityId: id,
    previousValue: existing,
    newValue: updated,
    reason: "Feedstock listing updated",
  });

  return updated;
}

export async function archiveFeedstock(id: string, actor: string): Promise<boolean> {
  const existing = feedstocks.get(id);
  if (!existing) return false;

  existing.status = "archived";
  existing.updatedAt = new Date().toISOString();

  await appendAuditEntry({
    actor,
    action: "FEEDSTOCK_ARCHIVED",
    entityType: "feedstock",
    entityId: id,
    previousValue: { status: "active" },
    newValue: { status: "archived" },
    reason: "Feedstock listing archived (soft delete)",
  });

  return true;
}

// ── Processor CRUD ────────────────────────────────────────────────────

export async function createProcessor(input: CreateProcessorInput, ownerId: string): Promise<Processor> {
  const now = new Date().toISOString();
  const processor: Processor = {
    id: uuid(),
    ownerId,
    ...input,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  processors.set(processor.id, processor);

  await appendAuditEntry({
    actor: ownerId,
    action: "PROCESSOR_CREATED",
    entityType: "processor",
    entityId: processor.id,
    previousValue: null,
    newValue: processor,
    reason: "New processor listing created",
  });

  return processor;
}

export function getProcessor(id: string): Processor | undefined {
  return processors.get(id);
}

export function listProcessors(filters?: {
  technology?: string;
  region?: string;
  status?: string;
}): Processor[] {
  let results = Array.from(processors.values());
  if (filters?.technology) results = results.filter((p) => p.technology === filters.technology);
  if (filters?.region) results = results.filter((p) => p.region === filters.region);
  if (filters?.status) results = results.filter((p) => p.status === filters.status);
  return results;
}

export async function updateProcessor(
  id: string,
  updates: Partial<CreateProcessorInput>,
  actor: string
): Promise<Processor | undefined> {
  const existing = processors.get(id);
  if (!existing) return undefined;

  const updated: Processor = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  processors.set(id, updated);

  await appendAuditEntry({
    actor,
    action: "PROCESSOR_UPDATED",
    entityType: "processor",
    entityId: id,
    previousValue: existing,
    newValue: updated,
    reason: "Processor listing updated",
  });

  return updated;
}

export async function archiveProcessor(id: string, actor: string): Promise<boolean> {
  const existing = processors.get(id);
  if (!existing) return false;

  existing.status = "archived";
  existing.updatedAt = new Date().toISOString();

  await appendAuditEntry({
    actor,
    action: "PROCESSOR_ARCHIVED",
    entityType: "processor",
    entityId: id,
    previousValue: { status: "active" },
    newValue: { status: "archived" },
    reason: "Processor listing archived (soft delete)",
  });

  return true;
}

// ── Match storage ─────────────────────────────────────────────────────

export async function saveMatch(match: Match): Promise<void> {
  matches.set(match.id, match);

  await appendAuditEntry({
    actor: "system",
    action: "MATCH_COMPUTED",
    entityType: "match",
    entityId: match.id,
    previousValue: null,
    newValue: {
      feedstockId: match.feedstockId,
      processorId: match.processorId,
      compatibilityScore: match.compatibilityScore,
      contaminationRisk: match.contaminationRisk,
      netImpactKg: match.lca.netImpactKg,
    },
    reason: "Match computed by matching engine",
  });
}

export function getMatch(id: string): Match | undefined {
  return matches.get(id);
}

export function listMatches(filters?: {
  feedstockOwnerId?: string;
  processorOwnerId?: string;
  status?: string;
}): Match[] {
  let results = Array.from(matches.values());
  if (filters?.feedstockOwnerId) results = results.filter((m) => m.feedstockOwnerId === filters.feedstockOwnerId);
  if (filters?.processorOwnerId) results = results.filter((m) => m.processorOwnerId === filters.processorOwnerId);
  if (filters?.status) results = results.filter((m) => m.status === filters.status);
  return results;
}

export async function updateMatchStatus(
  id: string,
  status: Match["status"],
  actor: string
): Promise<Match | undefined> {
  const match = matches.get(id);
  if (!match) return undefined;

  const prevStatus = match.status;
  match.status = status;
  match.updatedAt = new Date().toISOString();
  match.statusHistory.push({ status, timestamp: match.updatedAt, actor });

  const actionMap: Record<string, string> = {
    proposed: "MATCH_PROPOSED",
    accepted: "MATCH_ACCEPTED",
    rejected: "MATCH_REJECTED",
    expired: "MATCH_EXPIRED",
  };

  await appendAuditEntry({
    actor,
    action: (actionMap[status] ?? "MATCH_PROPOSED") as any,
    entityType: "match",
    entityId: id,
    previousValue: { status: prevStatus },
    newValue: { status },
    reason: `Match status changed from ${prevStatus} to ${status}`,
  });

  return match;
}

// ── Seed data (for demo/development) ──────────────────────────────────

export async function seedDemoData(): Promise<void> {
  // Sample feedstocks
  await createFeedstock({
    name: "Heartland Corn Stover",
    category: "ag_residue",
    subtype: "stalks",
    location: { lat: 41.878, lng: -93.098 },
    address: "2100 Farm Road, Ames, IA 50010",
    region: "US-IA",
    volumeTonnesPerMonth: 500,
    composition: { moisturePct: 20, cnRatio: 55, dryMatterPct: 80 },
    contaminationFlags: { heavyMetals: false, plasticFragments: false, pesticideResidue: false, pathogens: false },
    certifications: [],
    availableFrom: "2026-09-01T00:00:00Z",
    availableTo: "2026-12-31T00:00:00Z",
    baselineScenario: "field_incorporation",
    notes: "Post-harvest stover, available Sep–Dec",
  }, "demo-farmer-1");

  await createFeedstock({
    name: "Metro Food Processing Waste",
    category: "food_waste",
    subtype: "processing_byproduct",
    location: { lat: 41.600, lng: -93.609 },
    address: "500 Industrial Blvd, Des Moines, IA 50309",
    region: "US-IA",
    volumeTonnesPerMonth: 200,
    composition: { moisturePct: 72, cnRatio: 15, dryMatterPct: 28, ph: 5.2 },
    contaminationFlags: { heavyMetals: false, plasticFragments: true, pesticideResidue: false, pathogens: false },
    certifications: ["USDA-organic"],
    availableFrom: "2026-01-01T00:00:00Z",
    baselineScenario: "landfill_gas_capture",
    notes: "Vegetable processing trimmings, year-round",
  }, "demo-foodprocessor-1");

  await createFeedstock({
    name: "Sawmill Residues NW",
    category: "forestry_residue",
    subtype: "sawdust",
    location: { lat: 45.523, lng: -122.676 },
    address: "8200 Timber Way, Portland, OR 97201",
    region: "US-OR",
    volumeTonnesPerMonth: 300,
    composition: { moisturePct: 45, cnRatio: 400, dryMatterPct: 55 },
    contaminationFlags: { heavyMetals: false, plasticFragments: false, pesticideResidue: false, pathogens: false },
    certifications: ["FSC"],
    availableFrom: "2026-01-01T00:00:00Z",
    baselineScenario: "decay_in_place",
  }, "demo-sawmill-1");

  await createFeedstock({
    name: "Dairy Manure - Central Valley",
    category: "manure",
    subtype: "cattle",
    location: { lat: 36.778, lng: -119.418 },
    address: "4500 Dairy Lane, Fresno, CA 93706",
    region: "US-CA",
    volumeTonnesPerMonth: 800,
    composition: { moisturePct: 85, cnRatio: 18, dryMatterPct: 15, ph: 7.5 },
    contaminationFlags: { heavyMetals: false, plasticFragments: false, pesticideResidue: false, pathogens: true },
    certifications: [],
    availableFrom: "2026-01-01T00:00:00Z",
    baselineScenario: "lagoon_storage",
    notes: "Continuous supply, 2000-head dairy operation",
  }, "demo-dairy-1");

  // Sample processors
  await createProcessor({
    name: "Iowa BioDigest LLC",
    technology: "ad_mesophilic",
    location: { lat: 41.700, lng: -93.400 },
    address: "1200 Energy Park, Ankeny, IA 50023",
    region: "US-IA",
    intakeCapacityTonnesPerMonth: 1000,
    currentUtilizationPct: 45,
    acceptedCategories: ["food_waste", "ag_residue", "manure"],
    acceptedSubtypes: ["pre_consumer", "post_consumer", "processing_byproduct", "stalks", "husks", "cattle", "swine"],
    compositionTolerance: {
      moistureRange: [15, 90],
      cnRange: [10, 80],
      phRange: [5.0, 8.5],
      prohibitedSubstances: ["heavy_metals", "treated_wood"],
    },
    serviceRadiusKm: 150,
    certifications: ["RFS-D3", "ISCC-EU"],
    permits: ["IA-DEQ-2024-0892"],
    fugitiveEmissionRate: 1.5,
  }, "demo-processor-1");

  await createProcessor({
    name: "GreenCompost Municipal",
    technology: "composting_in_vessel",
    location: { lat: 41.550, lng: -93.650 },
    address: "300 Recycle Drive, Des Moines, IA 50316",
    region: "US-IA",
    intakeCapacityTonnesPerMonth: 400,
    currentUtilizationPct: 60,
    acceptedCategories: ["food_waste", "ag_residue"],
    acceptedSubtypes: ["pre_consumer", "post_consumer", "processing_byproduct", "straw", "husks", "stalks"],
    compositionTolerance: {
      moistureRange: [30, 70],
      cnRange: [20, 40],
      phRange: [5.5, 8.0],
      prohibitedSubstances: ["heavy_metals", "plastic"],
    },
    serviceRadiusKm: 80,
    certifications: ["USCC-STA"],
    permits: ["IA-DNR-COMP-2023-445"],
  }, "demo-processor-2");

  await createProcessor({
    name: "Pacific Pyrolysis Co.",
    technology: "pyrolysis",
    location: { lat: 45.600, lng: -122.500 },
    address: "9100 Industrial Park Rd, Gresham, OR 97030",
    region: "US-OR",
    intakeCapacityTonnesPerMonth: 250,
    currentUtilizationPct: 30,
    acceptedCategories: ["forestry_residue", "ag_residue"],
    acceptedSubtypes: ["bark", "sawdust", "slash", "chips", "straw", "husks", "stalks", "shells", "bagasse"],
    compositionTolerance: {
      moistureRange: [5, 50],
      cnRange: [30, 500],
      prohibitedSubstances: ["heavy_metals", "treated_wood", "plastic"],
    },
    serviceRadiusKm: 200,
    certifications: ["ISCC-PLUS"],
    permits: ["OR-DEQ-2024-1123"],
  }, "demo-processor-3");

  await createProcessor({
    name: "Valley Biogas Partners",
    technology: "ad_thermophilic",
    location: { lat: 36.850, lng: -119.500 },
    address: "7800 Biogas Blvd, Madera, CA 93637",
    region: "US-CA",
    intakeCapacityTonnesPerMonth: 1500,
    currentUtilizationPct: 55,
    acceptedCategories: ["manure", "food_waste", "ag_residue"],
    acceptedSubtypes: ["cattle", "swine", "poultry", "pre_consumer", "post_consumer", "processing_byproduct", "stalks", "bagasse"],
    compositionTolerance: {
      moistureRange: [50, 95],
      cnRange: [10, 35],
      phRange: [6.0, 8.5],
      prohibitedSubstances: ["heavy_metals", "plastic", "treated_wood"],
    },
    serviceRadiusKm: 120,
    certifications: ["LCFS-pathway", "RFS-D3"],
    permits: ["CA-RWQCB-2024-0567"],
    fugitiveEmissionRate: 2.0,
  }, "demo-processor-4");
}
