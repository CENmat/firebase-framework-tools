/**
 * FeedstockMatch — Zod validation schemas for API input
 */

import { z } from "zod";

// ── Shared ────────────────────────────────────────────────────────────

const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const feedstockCategorySchema = z.enum([
  "food_waste",
  "ag_residue",
  "forestry_residue",
  "manure",
]);

const feedstockSubtypeSchema = z.enum([
  "pre_consumer",
  "post_consumer",
  "processing_byproduct",
  "straw",
  "husks",
  "stalks",
  "bagasse",
  "shells",
  "bark",
  "sawdust",
  "slash",
  "chips",
  "cattle",
  "swine",
  "poultry",
]);

const processorTechnologySchema = z.enum([
  "composting_windrow",
  "composting_in_vessel",
  "composting_vermicompost",
  "ad_mesophilic",
  "ad_thermophilic",
  "ad_dry",
  "biorefinery_ethanol",
  "biorefinery_biochemical",
  "pyrolysis",
  "gasification",
  "animal_feed",
]);

const baselineScenarioSchema = z.enum([
  "landfill_gas_capture",
  "landfill_no_capture",
  "open_dump",
  "open_burning",
  "field_incorporation",
  "slash_burning",
  "decay_in_place",
  "lagoon_storage",
  "existing_composting",
]);

const transportModeSchema = z.enum(["truck_full", "truck_avg", "rail", "barge"]);

// ── Feedstock ─────────────────────────────────────────────────────────

export const createFeedstockSchema = z.object({
  name: z.string().min(1).max(200),
  category: feedstockCategorySchema,
  subtype: feedstockSubtypeSchema,
  location: geoPointSchema,
  address: z.string().min(1).max(500),
  region: z.string().min(1).max(20),
  volumeTonnesPerMonth: z.number().positive(),
  composition: z.object({
    moisturePct: z.number().min(0).max(100),
    cnRatio: z.number().positive(),
    dryMatterPct: z.number().min(0).max(100),
    ashPct: z.number().min(0).max(100).optional(),
    volatileSolidsPct: z.number().min(0).max(100).optional(),
    ph: z.number().min(0).max(14).optional(),
  }),
  contaminationFlags: z.object({
    heavyMetals: z.boolean(),
    plasticFragments: z.boolean(),
    pesticideResidue: z.boolean(),
    pathogens: z.boolean(),
    other: z.array(z.string()).optional(),
  }),
  certifications: z.array(z.string()).default([]),
  availableFrom: z.string().datetime(),
  availableTo: z.string().datetime().optional(),
  baselineScenario: baselineScenarioSchema,
  notes: z.string().max(2000).optional(),
});

export const updateFeedstockSchema = createFeedstockSchema.partial();

// ── Processor ─────────────────────────────────────────────────────────

export const createProcessorSchema = z.object({
  name: z.string().min(1).max(200),
  technology: processorTechnologySchema,
  location: geoPointSchema,
  address: z.string().min(1).max(500),
  region: z.string().min(1).max(20),
  intakeCapacityTonnesPerMonth: z.number().positive(),
  currentUtilizationPct: z.number().min(0).max(100),
  acceptedCategories: z.array(feedstockCategorySchema).min(1),
  acceptedSubtypes: z.array(feedstockSubtypeSchema).min(1),
  compositionTolerance: z.object({
    moistureRange: z.tuple([z.number(), z.number()]),
    cnRange: z.tuple([z.number(), z.number()]),
    phRange: z.tuple([z.number(), z.number()]).optional(),
    prohibitedSubstances: z.array(z.string()).default([]),
  }),
  serviceRadiusKm: z.number().positive().max(2000),
  certifications: z.array(z.string()).default([]),
  permits: z.array(z.string()).default([]),
  fugitiveEmissionRate: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateProcessorSchema = createProcessorSchema.partial();

// ── Scenario ──────────────────────────────────────────────────────────

export const scenarioParamsSchema = z.object({
  transportMode: transportModeSchema.default("truck_avg"),
  maxDistanceKm: z.number().positive().max(2000).default(200),
  baselineScenario: baselineScenarioSchema.default("landfill_gas_capture"),
  fugitiveLeakRatePct: z.number().min(0).max(100).default(2),
  gridEmissionFactor: z.number().positive().default(0.4),
  includeAvoidedEmissions: z.boolean().default(true),
  uncertaintyMethod: z.enum(["deterministic", "monte_carlo"]).default("deterministic"),
});

// ── Match Compute Request ─────────────────────────────────────────────

export const computeMatchSchema = z.object({
  feedstockId: z.string().uuid(),
  processorId: z.string().uuid(),
  volumeTonnes: z.number().positive().optional(),
  scenarioOverrides: scenarioParamsSchema.partial().optional(),
});

export type CreateFeedstockInput = z.infer<typeof createFeedstockSchema>;
export type UpdateFeedstockInput = z.infer<typeof updateFeedstockSchema>;
export type CreateProcessorInput = z.infer<typeof createProcessorSchema>;
export type UpdateProcessorInput = z.infer<typeof updateProcessorSchema>;
export type ScenarioParamsInput = z.infer<typeof scenarioParamsSchema>;
export type ComputeMatchInput = z.infer<typeof computeMatchSchema>;
