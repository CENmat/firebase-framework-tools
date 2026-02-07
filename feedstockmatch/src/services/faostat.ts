/**
 * FeedstockMatch — FAOSTAT Data Integration
 *
 * Provides estimated residue availability by country/crop using
 * FAOSTAT production data and residue-to-product ratios (RPR).
 *
 * Data source: https://github.com/FAOSTAT/faostat-api
 * API base: https://fenixservices.fao.org/faostat/api/v1/
 *
 * Integration plan:
 *   1. MVP: Curated static dataset of top crops × top 50 countries
 *   2. v1.1: Scheduled sync (quarterly) from FAOSTAT bulk download
 *   3. v2.0: Real-time API queries with caching layer
 */

import type { FAOResidueEstimate } from "../models/types.js";

// ── Residue-to-Product Ratios (RPR) ──────────────────────────────────
//
// Sources:
//   - Lal, R. (2005). World crop residues production and implications
//   - Fischer et al. (2007) for IIASA/FAO
//   - IPCC 2006 Guidelines, Vol 4, Ch 11, Table 11.2

interface RPREntry {
  crop: string;
  faostatItemCode: number;
  rpr: number; // kg residue / kg product
  residueType: string;
  fieldUseRate: number; // fraction typically left on field (0–1)
  source: string;
}

const RESIDUE_RATIOS: RPREntry[] = [
  { crop: "Wheat", faostatItemCode: 15, rpr: 1.3, residueType: "straw", fieldUseRate: 0.4, source: "Lal 2005, wheat straw" },
  { crop: "Rice, paddy", faostatItemCode: 27, rpr: 1.4, residueType: "straw + husks", fieldUseRate: 0.35, source: "IPCC 2006, Table 11.2" },
  { crop: "Maize (corn)", faostatItemCode: 56, rpr: 1.0, residueType: "stover", fieldUseRate: 0.4, source: "Lal 2005, corn stover" },
  { crop: "Barley", faostatItemCode: 44, rpr: 1.2, residueType: "straw", fieldUseRate: 0.5, source: "Fischer et al. 2007" },
  { crop: "Sorghum", faostatItemCode: 83, rpr: 1.4, residueType: "stalks", fieldUseRate: 0.5, source: "Fischer et al. 2007" },
  { crop: "Soybeans", faostatItemCode: 236, rpr: 2.1, residueType: "stalks + pods", fieldUseRate: 0.6, source: "Lal 2005" },
  { crop: "Sugar cane", faostatItemCode: 156, rpr: 0.3, residueType: "bagasse + tops/leaves", fieldUseRate: 0.3, source: "Lal 2005, sugarcane" },
  { crop: "Oil palm fruit", faostatItemCode: 254, rpr: 0.4, residueType: "empty fruit bunches + fronds", fieldUseRate: 0.2, source: "MPOB 2020" },
  { crop: "Cassava", faostatItemCode: 125, rpr: 0.4, residueType: "tops + peels", fieldUseRate: 0.6, source: "Fischer et al. 2007" },
  { crop: "Potatoes", faostatItemCode: 116, rpr: 0.4, residueType: "haulms", fieldUseRate: 0.7, source: "Fischer et al. 2007" },
  { crop: "Rapeseed", faostatItemCode: 270, rpr: 1.8, residueType: "straw", fieldUseRate: 0.5, source: "Lal 2005" },
  { crop: "Cotton lint", faostatItemCode: 767, rpr: 3.0, residueType: "stalks", fieldUseRate: 0.3, source: "Lal 2005, cotton stalks" },
  { crop: "Groundnuts", faostatItemCode: 242, rpr: 2.3, residueType: "shells + haulms", fieldUseRate: 0.5, source: "Lal 2005" },
  { crop: "Millet", faostatItemCode: 79, rpr: 1.4, residueType: "stalks", fieldUseRate: 0.6, source: "Fischer et al. 2007" },
  { crop: "Sunflower seed", faostatItemCode: 267, rpr: 2.5, residueType: "stalks + heads", fieldUseRate: 0.4, source: "Lal 2005" },
];

// ── Curated production data (MVP static dataset) ─────────────────────
//
// Source: FAOSTAT Production → Crops and livestock products
// Year: 2022 (most recent complete year in FAOSTAT as of 2025)
// Unit: tonnes
//
// In production, this is replaced by FAOSTAT API calls:
//   GET https://fenixservices.fao.org/faostat/api/v1/en/data/QCL
//   Parameters: area, item, element=5510 (Production), year

interface ProductionRecord {
  countryCode: string;
  countryName: string;
  faostatItemCode: number;
  productionTonnes: number;
  year: number;
}

const PRODUCTION_DATA: ProductionRecord[] = [
  // United States
  { countryCode: "US", countryName: "United States", faostatItemCode: 56, productionTonnes: 348_750_000, year: 2022 },
  { countryCode: "US", countryName: "United States", faostatItemCode: 236, productionTonnes: 116_377_000, year: 2022 },
  { countryCode: "US", countryName: "United States", faostatItemCode: 15, productionTonnes: 44_900_000, year: 2022 },
  // China
  { countryCode: "CN", countryName: "China", faostatItemCode: 56, productionTonnes: 277_200_000, year: 2022 },
  { countryCode: "CN", countryName: "China", faostatItemCode: 27, productionTonnes: 208_490_000, year: 2022 },
  { countryCode: "CN", countryName: "China", faostatItemCode: 15, productionTonnes: 137_720_000, year: 2022 },
  // India
  { countryCode: "IN", countryName: "India", faostatItemCode: 27, productionTonnes: 195_425_000, year: 2022 },
  { countryCode: "IN", countryName: "India", faostatItemCode: 15, productionTonnes: 106_840_000, year: 2022 },
  { countryCode: "IN", countryName: "India", faostatItemCode: 156, productionTonnes: 431_810_000, year: 2022 },
  // Brazil
  { countryCode: "BR", countryName: "Brazil", faostatItemCode: 156, productionTonnes: 746_828_000, year: 2022 },
  { countryCode: "BR", countryName: "Brazil", faostatItemCode: 236, productionTonnes: 124_049_000, year: 2022 },
  { countryCode: "BR", countryName: "Brazil", faostatItemCode: 56, productionTonnes: 109_420_000, year: 2022 },
  // EU (Germany as proxy)
  { countryCode: "DE", countryName: "Germany", faostatItemCode: 15, productionTonnes: 22_440_000, year: 2022 },
  { countryCode: "DE", countryName: "Germany", faostatItemCode: 44, productionTonnes: 11_010_000, year: 2022 },
  { countryCode: "DE", countryName: "Germany", faostatItemCode: 270, productionTonnes: 3_940_000, year: 2022 },
  // Indonesia
  { countryCode: "ID", countryName: "Indonesia", faostatItemCode: 27, productionTonnes: 54_750_000, year: 2022 },
  { countryCode: "ID", countryName: "Indonesia", faostatItemCode: 254, productionTonnes: 46_800_000, year: 2022 },
  // Nigeria
  { countryCode: "NG", countryName: "Nigeria", faostatItemCode: 125, productionTonnes: 60_000_000, year: 2022 },
  { countryCode: "NG", countryName: "Nigeria", faostatItemCode: 83, productionTonnes: 6_870_000, year: 2022 },
];

// ── Public API ────────────────────────────────────────────────────────

/**
 * Get residue estimates for a country (or all countries if not specified).
 */
export function getResidueEstimates(countryCode?: string): FAOResidueEstimate[] {
  const records = countryCode
    ? PRODUCTION_DATA.filter((r) => r.countryCode === countryCode)
    : PRODUCTION_DATA;

  return records.map((record) => {
    const rprEntry = RESIDUE_RATIOS.find((r) => r.faostatItemCode === record.faostatItemCode);
    if (!rprEntry) {
      return {
        countryCode: record.countryCode,
        countryName: record.countryName,
        crop: `Unknown (item ${record.faostatItemCode})`,
        productionTonnes: record.productionTonnes,
        residueToProductRatio: 0,
        totalResidueTonnes: 0,
        availableResidueTonnes: 0,
        year: record.year,
        source: "FAOSTAT 2022, no RPR available",
      };
    }

    const totalResidue = record.productionTonnes * rprEntry.rpr;
    const availableResidue = totalResidue * (1 - rprEntry.fieldUseRate);

    return {
      countryCode: record.countryCode,
      countryName: record.countryName,
      crop: rprEntry.crop,
      productionTonnes: record.productionTonnes,
      residueToProductRatio: rprEntry.rpr,
      totalResidueTonnes: Math.round(totalResidue),
      availableResidueTonnes: Math.round(availableResidue),
      year: record.year,
      source: `FAOSTAT ${record.year} production × ${rprEntry.source}`,
    };
  });
}

/**
 * Get the list of available crops and their RPR data.
 */
export function getResidueRatios(): RPREntry[] {
  return [...RESIDUE_RATIOS];
}

/**
 * FAOSTAT API integration plan for production use.
 *
 * The FAOSTAT API (https://github.com/FAOSTAT/faostat-api) provides:
 *
 * 1. Bulk download endpoints:
 *    GET /v1/en/data/QCL — Crops and livestock products
 *    Parameters: area_cs (M49 codes), item_cs, element_cs=5510, year_cs
 *
 * 2. Dimension lists:
 *    GET /v1/en/dimensions/QCL/area — Available countries
 *    GET /v1/en/dimensions/QCL/item — Available crops
 *
 * 3. Implementation roadmap:
 *    Phase 1 (MVP): Static curated dataset (current implementation)
 *    Phase 2: Cloud Function runs quarterly to fetch latest FAOSTAT data,
 *             stores in Cloud SQL, serves via API cache
 *    Phase 3: User can trigger refresh for specific country/crop combos
 *             with real-time FAOSTAT queries
 *
 * 4. Data freshness: FAOSTAT updates annually (2–3 year lag for final data).
 *    Quarterly sync is sufficient for production accuracy.
 */
export const FAOSTAT_INTEGRATION_PLAN = {
  apiBase: "https://fenixservices.fao.org/faostat/api/v1",
  githubRepo: "https://github.com/FAOSTAT/faostat-api",
  endpoints: {
    cropProduction: "/en/data/QCL",
    countryList: "/en/dimensions/QCL/area",
    cropList: "/en/dimensions/QCL/item",
  },
  syncSchedule: "quarterly",
  dataLag: "2-3 years for final data",
  phases: ["static_curated", "scheduled_sync", "real_time_queries"],
};
