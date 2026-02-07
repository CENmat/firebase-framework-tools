/**
 * FeedstockMatch — LCA (Life Cycle Assessment) Engine
 *
 * Transparent, auditable GHG impact calculations.
 * Every factor is sourced and documented inline.
 */

import type {
  BaselineScenario,
  ProcessorTechnology,
  TransportMode,
  LCABreakdown,
  LCAMethodologyRef,
  Feedstock,
  Processor,
  ScenarioParams,
} from "../models/types.js";

// ── Emission Factors ──────────────────────────────────────────────────

/**
 * Baseline emission factors: kg CO₂e per tonne of feedstock
 * if it follows the baseline (counterfactual) pathway.
 */
const BASELINE_FACTORS: Record<BaselineScenario, { factor: number; source: string }> = {
  landfill_gas_capture: { factor: 580, source: "EPA WARM v16, managed landfill with 75% gas capture" },
  landfill_no_capture: { factor: 890, source: "EPA WARM v16, unmanaged landfill" },
  open_dump: { factor: 1100, source: "IPCC 2019 Refinement, Ch. 3, tropical default" },
  open_burning: { factor: 92, source: "IPCC 2006 GL, field burning of ag residues (CH₄+N₂O)" },
  field_incorporation: { factor: -12, source: "IPCC Tier 1, soil C sequestration from residue incorporation" },
  slash_burning: { factor: 110, source: "US EPA AP-42, Ch. 13.1, prescribed burning" },
  decay_in_place: { factor: 15, source: "IPCC wetland supplement, slow anaerobic decay" },
  lagoon_storage: { factor: 340, source: "EPA AgSTAR, uncovered anaerobic lagoon, temperate" },
  existing_composting: { factor: 55, source: "IPCC 2006 GL, Ch. 4, windrow composting baseline" },
};

/**
 * Transport emission factors: kg CO₂e per tonne-km
 */
const TRANSPORT_FACTORS: Record<TransportMode, { factor: number; source: string }> = {
  truck_full: { factor: 0.062, source: "GLEC Framework v3.0, rigid truck >20t, full load" },
  truck_avg: { factor: 0.089, source: "GLEC Framework v3.0, rigid truck >20t, average load factor" },
  rail: { factor: 0.022, source: "GLEC Framework v3.0, freight rail, diesel" },
  barge: { factor: 0.016, source: "GLEC Framework v3.0, inland waterway" },
};

/**
 * Processing emission factors: kg CO₂e per tonne of input
 * For AD, fugitive methane is added separately.
 */
const PROCESSING_FACTORS: Record<ProcessorTechnology, { factor: number; source: string }> = {
  composting_windrow: { factor: 55, source: "IPCC 2006 GL, Ch. 4, Table 4.1" },
  composting_in_vessel: { factor: 32, source: "Boldrin et al. 2009, enclosed composting" },
  composting_vermicompost: { factor: 28, source: "Lleó et al. 2013, vermicomposting LCA" },
  ad_mesophilic: { factor: 18, source: "IPCC 2019, mesophilic AD base (excl. fugitive)" },
  ad_thermophilic: { factor: 22, source: "IPCC 2019, thermophilic AD base (excl. fugitive)" },
  ad_dry: { factor: 20, source: "IPCC 2019, dry AD, interpolated" },
  biorefinery_ethanol: { factor: 85, source: "GREET 2024, cellulosic ethanol pathway" },
  biorefinery_biochemical: { factor: 75, source: "GREET 2024, biochemical platform average" },
  pyrolysis: { factor: 45, source: "Woolf et al. 2010, slow pyrolysis net (incl. biochar credit)" },
  gasification: { factor: 60, source: "Arena 2012, waste gasification LCA" },
  animal_feed: { factor: 12, source: "Zu Ermgassen et al. 2016, feed processing" },
};

/**
 * Avoided emission credits: kg CO₂e per tonne of feedstock input,
 * based on the output displacing conventional products.
 *
 * These are rough per-tonne-input credits. In production, these would
 * be calculated from actual yield data per facility.
 */
const AVOIDED_EMISSION_CREDITS: Record<ProcessorTechnology, { factor: number; displaced: string; source: string }> = {
  composting_windrow: { factor: 35, displaced: "synthetic N fertilizer", source: "ecoinvent 3.9, ammonium nitrate production" },
  composting_in_vessel: { factor: 40, displaced: "synthetic N fertilizer", source: "ecoinvent 3.9" },
  composting_vermicompost: { factor: 45, displaced: "synthetic N+P fertilizer", source: "ecoinvent 3.9" },
  ad_mesophilic: { factor: 180, displaced: "grid electricity + natural gas", source: "IEA emission factors by country, 2024" },
  ad_thermophilic: { factor: 200, displaced: "grid electricity + natural gas", source: "IEA emission factors by country, 2024" },
  ad_dry: { factor: 160, displaced: "grid electricity + natural gas", source: "IEA emission factors by country, 2024" },
  biorefinery_ethanol: { factor: 250, displaced: "gasoline", source: "GREET 2024, E85 pathway" },
  biorefinery_biochemical: { factor: 190, displaced: "petroleum-based chemicals", source: "GREET 2024" },
  pyrolysis: { factor: 350, displaced: "fossil fuels + carbon sequestration (biochar)", source: "Woolf et al. 2010" },
  gasification: { factor: 220, displaced: "natural gas for syngas", source: "Arena 2012" },
  animal_feed: { factor: 120, displaced: "soy meal + corn feed", source: "Zu Ermgassen et al. 2016" },
};

// ── GWP ───────────────────────────────────────────────────────────────

/** CH₄ global warming potential (100-year, IPCC AR6) */
const GWP_CH4 = 27.9;

// ── Engine ────────────────────────────────────────────────────────────

export interface LCAInput {
  feedstock: Feedstock;
  processor: Processor;
  distanceKm: number;
  volumeTonnes: number;
  scenario: ScenarioParams;
}

/**
 * Calculate the full LCA breakdown for a feedstock→processor match.
 */
export function calculateLCA(input: LCAInput): LCABreakdown {
  const { feedstock, processor, distanceKm, volumeTonnes, scenario } = input;

  // 1. Baseline emissions (what would happen without diversion)
  const baseline = BASELINE_FACTORS[scenario.baselineScenario] ?? BASELINE_FACTORS[feedstock.baselineScenario];
  const baselineEmissionsKg = baseline.factor * volumeTonnes;

  // 2. Transport emissions
  const transport = TRANSPORT_FACTORS[scenario.transportMode];
  const transportEmissionsKg = transport.factor * volumeTonnes * distanceKm;

  // 3. Processing emissions
  const processing = PROCESSING_FACTORS[processor.technology];
  let processingEmissionsKg = processing.factor * volumeTonnes;

  // Add fugitive CH₄ for AD technologies
  if (processor.technology.startsWith("ad_")) {
    const leakRate = (scenario.fugitiveLeakRatePct ?? processor.fugitiveEmissionRate ?? 2) / 100;
    // Biogas yield ~100 m³/tonne for food waste, ~60% CH₄ by volume, CH₄ density 0.657 kg/m³
    const biogasYieldM3PerTonne = 100;
    const ch4Fraction = 0.6;
    const ch4DensityKgPerM3 = 0.657;
    const ch4ProducedKg = volumeTonnes * biogasYieldM3PerTonne * ch4Fraction * ch4DensityKgPerM3;
    const fugitiveCH4Kg = ch4ProducedKg * leakRate;
    processingEmissionsKg += fugitiveCH4Kg * GWP_CH4;
  }

  // 4. Avoided emissions
  let avoidedEmissionsKg = 0;
  if (scenario.includeAvoidedEmissions) {
    const credit = AVOIDED_EMISSION_CREDITS[processor.technology];
    avoidedEmissionsKg = credit.factor * volumeTonnes;

    // Adjust AD credits by grid emission factor
    if (processor.technology.startsWith("ad_")) {
      // Default credits assume 0.4 kg CO₂e/kWh grid; scale linearly
      avoidedEmissionsKg *= scenario.gridEmissionFactor / 0.4;
    }
  }

  // 5. Net impact
  const netImpactKg = baselineEmissionsKg - transportEmissionsKg - processingEmissionsKg + avoidedEmissionsKg;

  // 6. Uncertainty
  const uncertaintyRangePct = scenario.uncertaintyMethod === "monte_carlo" ? 25 : 30;

  // Determine dominant uncertainty parameter
  const components = {
    baseline: Math.abs(baselineEmissionsKg),
    transport: Math.abs(transportEmissionsKg),
    processing: Math.abs(processingEmissionsKg),
    avoided: Math.abs(avoidedEmissionsKg),
  };
  const dominantParameter = Object.entries(components).sort(([, a], [, b]) => b - a)[0][0];

  // Data quality: 3 = mixed measured + estimated (default for MVP)
  const dataQualityScore = 3;

  const methodology: LCAMethodologyRef = {
    baselineSource: baseline.source,
    transportSource: transport.source,
    processingSource: processing.source,
    avoidedSource: scenario.includeAvoidedEmissions
      ? AVOIDED_EMISSION_CREDITS[processor.technology].source
      : "N/A — avoided emissions excluded",
    systemBoundary: "Cradle-to-gate: feedstock generation → collection/transport → processing → output. Excludes downstream product use phase.",
    notes: `Calculated with ${scenario.uncertaintyMethod} method. Transport distance: ${distanceKm} km via ${scenario.transportMode}. Grid EF: ${scenario.gridEmissionFactor} kg CO₂e/kWh.`,
  };

  return {
    baselineEmissionsKg: round(baselineEmissionsKg),
    transportEmissionsKg: round(transportEmissionsKg),
    processingEmissionsKg: round(processingEmissionsKg),
    avoidedEmissionsKg: round(avoidedEmissionsKg),
    netImpactKg: round(netImpactKg),
    uncertaintyRangePct,
    dataQualityScore,
    dominantParameter,
    methodology,
  };
}

/**
 * Get all emission factor tables for transparency display.
 */
export function getEmissionFactorTables() {
  return {
    baseline: BASELINE_FACTORS,
    transport: TRANSPORT_FACTORS,
    processing: PROCESSING_FACTORS,
    avoided: AVOIDED_EMISSION_CREDITS,
    gwp: { ch4_100yr_ar6: GWP_CH4 },
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
