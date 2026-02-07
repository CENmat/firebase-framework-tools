/**
 * FeedstockMatch — LCA Engine Tests
 */

import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import { calculateLCA, getEmissionFactorTables } from "../src/services/lca-engine.js";
import type { Feedstock, Processor, ScenarioParams } from "../src/models/types.js";

function makeFeedstock(overrides: Partial<Feedstock> = {}): Feedstock {
  return {
    id: "test-feedstock-1",
    ownerId: "test-owner",
    name: "Test Corn Stover",
    category: "ag_residue",
    subtype: "stalks",
    location: { lat: 41.878, lng: -93.098 },
    address: "Test, IA",
    region: "US-IA",
    volumeTonnesPerMonth: 100,
    composition: { moisturePct: 20, cnRatio: 55, dryMatterPct: 80 },
    contaminationFlags: { heavyMetals: false, plasticFragments: false, pesticideResidue: false, pathogens: false },
    certifications: [],
    availableFrom: "2026-01-01T00:00:00Z",
    baselineScenario: "field_incorporation",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProcessor(overrides: Partial<Processor> = {}): Processor {
  return {
    id: "test-processor-1",
    ownerId: "test-owner",
    name: "Test AD Facility",
    technology: "ad_mesophilic",
    location: { lat: 41.700, lng: -93.400 },
    address: "Test, IA",
    region: "US-IA",
    intakeCapacityTonnesPerMonth: 500,
    currentUtilizationPct: 50,
    acceptedCategories: ["ag_residue", "food_waste"],
    acceptedSubtypes: ["stalks", "husks", "processing_byproduct"],
    compositionTolerance: {
      moistureRange: [10, 90],
      cnRange: [10, 80],
      prohibitedSubstances: [],
    },
    serviceRadiusKm: 150,
    certifications: [],
    permits: [],
    fugitiveEmissionRate: 2,
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const DEFAULT_SCENARIO: ScenarioParams = {
  transportMode: "truck_avg",
  maxDistanceKm: 200,
  baselineScenario: "landfill_gas_capture",
  fugitiveLeakRatePct: 2,
  gridEmissionFactor: 0.4,
  includeAvoidedEmissions: true,
  uncertaintyMethod: "deterministic",
};

describe("LCA Engine", () => {
  describe("calculateLCA", () => {
    it("should return a positive net impact for food waste diverted from landfill to AD", () => {
      const result = calculateLCA({
        feedstock: makeFeedstock({ baselineScenario: "landfill_gas_capture" }),
        processor: makeProcessor({ technology: "ad_mesophilic" }),
        distanceKm: 50,
        volumeTonnes: 100,
        scenario: DEFAULT_SCENARIO,
      });

      assert.ok(result.netImpactKg > 0, "Net impact should be positive (climate benefit)");
      assert.ok(result.baselineEmissionsKg > 0, "Baseline emissions should be positive");
      assert.ok(result.transportEmissionsKg > 0, "Transport emissions should be positive");
      assert.ok(result.processingEmissionsKg > 0, "Processing emissions should be positive");
      assert.ok(result.avoidedEmissionsKg > 0, "Avoided emissions should be positive");
    });

    it("should calculate transport emissions correctly", () => {
      const result = calculateLCA({
        feedstock: makeFeedstock(),
        processor: makeProcessor(),
        distanceKm: 100,
        volumeTonnes: 50,
        scenario: { ...DEFAULT_SCENARIO, transportMode: "truck_avg" },
      });

      // 0.089 kg CO₂e/t-km × 50 tonnes × 100 km = 445 kg
      assert.equal(result.transportEmissionsKg, 445);
    });

    it("should include fugitive methane for AD technologies", () => {
      const withLeak = calculateLCA({
        feedstock: makeFeedstock(),
        processor: makeProcessor({ technology: "ad_mesophilic" }),
        distanceKm: 50,
        volumeTonnes: 100,
        scenario: { ...DEFAULT_SCENARIO, fugitiveLeakRatePct: 5 },
      });

      const noLeak = calculateLCA({
        feedstock: makeFeedstock(),
        processor: makeProcessor({ technology: "ad_mesophilic" }),
        distanceKm: 50,
        volumeTonnes: 100,
        scenario: { ...DEFAULT_SCENARIO, fugitiveLeakRatePct: 0 },
      });

      assert.ok(
        withLeak.processingEmissionsKg > noLeak.processingEmissionsKg,
        "Higher leak rate should increase processing emissions"
      );
    });

    it("should exclude avoided emissions when flag is off", () => {
      const result = calculateLCA({
        feedstock: makeFeedstock(),
        processor: makeProcessor(),
        distanceKm: 50,
        volumeTonnes: 100,
        scenario: { ...DEFAULT_SCENARIO, includeAvoidedEmissions: false },
      });

      assert.equal(result.avoidedEmissionsKg, 0);
    });

    it("should scale AD avoided emissions by grid emission factor", () => {
      const lowGrid = calculateLCA({
        feedstock: makeFeedstock(),
        processor: makeProcessor({ technology: "ad_mesophilic" }),
        distanceKm: 50,
        volumeTonnes: 100,
        scenario: { ...DEFAULT_SCENARIO, gridEmissionFactor: 0.1 },
      });

      const highGrid = calculateLCA({
        feedstock: makeFeedstock(),
        processor: makeProcessor({ technology: "ad_mesophilic" }),
        distanceKm: 50,
        volumeTonnes: 100,
        scenario: { ...DEFAULT_SCENARIO, gridEmissionFactor: 0.8 },
      });

      assert.ok(
        highGrid.avoidedEmissionsKg > lowGrid.avoidedEmissionsKg,
        "Higher grid EF should give more avoided emission credits"
      );
    });

    it("should include methodology references in every result", () => {
      const result = calculateLCA({
        feedstock: makeFeedstock(),
        processor: makeProcessor(),
        distanceKm: 50,
        volumeTonnes: 100,
        scenario: DEFAULT_SCENARIO,
      });

      assert.ok(result.methodology.baselineSource.length > 0);
      assert.ok(result.methodology.transportSource.length > 0);
      assert.ok(result.methodology.processingSource.length > 0);
      assert.ok(result.methodology.systemBoundary.length > 0);
    });
  });

  describe("getEmissionFactorTables", () => {
    it("should return all factor categories", () => {
      const tables = getEmissionFactorTables();
      assert.ok(tables.baseline);
      assert.ok(tables.transport);
      assert.ok(tables.processing);
      assert.ok(tables.avoided);
      assert.ok(tables.gwp);
    });

    it("should include source for every factor", () => {
      const tables = getEmissionFactorTables();
      for (const [, val] of Object.entries(tables.baseline)) {
        assert.ok(val.source.length > 0, "Baseline factor should have a source");
      }
      for (const [, val] of Object.entries(tables.transport)) {
        assert.ok(val.source.length > 0, "Transport factor should have a source");
      }
    });
  });
});
