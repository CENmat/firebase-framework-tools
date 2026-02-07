/**
 * FeedstockMatch — Core domain types
 */

// ── Geography ──────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoRegion {
  center: GeoPoint;
  radiusKm: number;
}

// ── Feedstock (Supply Side) ────────────────────────────────────────────

export type FeedstockCategory = "food_waste" | "ag_residue" | "forestry_residue" | "manure";

export type FeedstockSubtype =
  // Food waste
  | "pre_consumer"
  | "post_consumer"
  | "processing_byproduct"
  // Ag residue
  | "straw"
  | "husks"
  | "stalks"
  | "bagasse"
  | "shells"
  // Forestry
  | "bark"
  | "sawdust"
  | "slash"
  | "chips"
  // Manure
  | "cattle"
  | "swine"
  | "poultry";

export interface FeedstockComposition {
  moisturePct: number; // 0–100
  cnRatio: number; // C:N ratio
  dryMatterPct: number; // 0–100
  ashPct?: number;
  volatileSolidsPct?: number;
  ph?: number;
}

export interface ContaminationFlags {
  heavyMetals: boolean;
  plasticFragments: boolean;
  pesticideResidue: boolean;
  pathogens: boolean;
  other?: string[];
}

export interface SeasonalProfile {
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
}

export interface Feedstock {
  id: string;
  ownerId: string;
  name: string;
  category: FeedstockCategory;
  subtype: FeedstockSubtype;
  location: GeoPoint;
  address: string;
  region: string; // ISO 3166-2 or FAOSTAT area code
  volumeTonnesPerMonth: number;
  seasonalProfile?: SeasonalProfile;
  composition: FeedstockComposition;
  contaminationFlags: ContaminationFlags;
  certifications: string[];
  availableFrom: string; // ISO date
  availableTo?: string; // ISO date, undefined = ongoing
  baselineScenario: BaselineScenario;
  notes?: string;
  status: "active" | "paused" | "archived";
  createdAt: string;
  updatedAt: string;
}

// ── Processor (Demand Side) ───────────────────────────────────────────

export type ProcessorTechnology =
  | "composting_windrow"
  | "composting_in_vessel"
  | "composting_vermicompost"
  | "ad_mesophilic"
  | "ad_thermophilic"
  | "ad_dry"
  | "biorefinery_ethanol"
  | "biorefinery_biochemical"
  | "pyrolysis"
  | "gasification"
  | "animal_feed";

export interface CompositionTolerance {
  moistureRange: [number, number]; // [min%, max%]
  cnRange: [number, number];
  phRange?: [number, number];
  prohibitedSubstances: string[];
}

export interface Processor {
  id: string;
  ownerId: string;
  name: string;
  technology: ProcessorTechnology;
  location: GeoPoint;
  address: string;
  region: string;
  intakeCapacityTonnesPerMonth: number;
  currentUtilizationPct: number; // 0–100
  acceptedCategories: FeedstockCategory[];
  acceptedSubtypes: FeedstockSubtype[];
  compositionTolerance: CompositionTolerance;
  serviceRadiusKm: number;
  certifications: string[];
  permits: string[];
  fugitiveEmissionRate?: number; // % CH₄ leak for AD
  notes?: string;
  status: "active" | "paused" | "archived";
  createdAt: string;
  updatedAt: string;
}

// ── Matching ──────────────────────────────────────────────────────────

export type ContaminationRisk = "LOW" | "MEDIUM" | "HIGH" | "REJECT";

export type TransportMode = "truck_full" | "truck_avg" | "rail" | "barge";

export interface TransportEstimate {
  distanceKm: number;
  mode: TransportMode;
  co2eKg: number;
  routeSource: "osrm" | "haversine_fallback";
  durationMinutes?: number;
}

export interface LCABreakdown {
  baselineEmissionsKg: number; // avoided by diverting from baseline
  transportEmissionsKg: number;
  processingEmissionsKg: number;
  avoidedEmissionsKg: number; // credits from output products
  netImpactKg: number; // positive = climate benefit
  uncertaintyRangePct: number; // ±%
  dataQualityScore: number; // 1 (measured) → 5 (estimated)
  dominantParameter: string; // which factor drives uncertainty
  methodology: LCAMethodologyRef;
}

export interface LCAMethodologyRef {
  baselineSource: string;
  transportSource: string;
  processingSource: string;
  avoidedSource: string;
  systemBoundary: string;
  notes: string;
}

export type MatchStatus = "computed" | "proposed" | "accepted" | "rejected" | "expired" | "contracted";

export interface Match {
  id: string;
  feedstockId: string;
  processorId: string;
  feedstockOwnerId: string;
  processorOwnerId: string;
  compatibilityScore: number; // 0–100
  contaminationRisk: ContaminationRisk;
  transport: TransportEstimate;
  lca: LCABreakdown;
  safetyChecklist: SafetyChecklistItem[];
  volumeTonnesProposed: number;
  status: MatchStatus;
  statusHistory: { status: MatchStatus; timestamp: string; actor: string }[];
  createdAt: string;
  updatedAt: string;
}

// ── Safety & Compliance ───────────────────────────────────────────────

export type CheckStatus = "PASS" | "FAIL" | "NEEDS_REVIEW" | "NOT_APPLICABLE";

export interface SafetyChecklistItem {
  id: string;
  description: string;
  status: CheckStatus;
  requiredForRiskLevel: ContaminationRisk[];
  evidence?: string; // URL or description of evidence
  verifiedBy?: string;
  verifiedAt?: string;
}

export type BaselineScenario =
  | "landfill_gas_capture"
  | "landfill_no_capture"
  | "open_dump"
  | "open_burning"
  | "field_incorporation"
  | "slash_burning"
  | "decay_in_place"
  | "lagoon_storage"
  | "existing_composting";

// ── Audit ─────────────────────────────────────────────────────────────

export type AuditAction =
  | "FEEDSTOCK_CREATED"
  | "FEEDSTOCK_UPDATED"
  | "FEEDSTOCK_ARCHIVED"
  | "PROCESSOR_CREATED"
  | "PROCESSOR_UPDATED"
  | "PROCESSOR_ARCHIVED"
  | "MATCH_COMPUTED"
  | "MATCH_PROPOSED"
  | "MATCH_ACCEPTED"
  | "MATCH_REJECTED"
  | "MATCH_EXPIRED"
  | "PARAM_OVERRIDE"
  | "CHECKLIST_UPDATED"
  | "LCA_RECALCULATED"
  | "EXPORT_GENERATED";

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: AuditAction;
  entityType: "feedstock" | "processor" | "match" | "system";
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  ipAddress: string;
  geoLocation?: string;
  checksumPrev: string;
  checksum: string;
}

// ── Scenario / Slider ─────────────────────────────────────────────────

export interface ScenarioParams {
  transportMode: TransportMode;
  maxDistanceKm: number;
  baselineScenario: BaselineScenario;
  fugitiveLeakRatePct: number; // for AD
  gridEmissionFactor: number; // kg CO₂e/kWh for electricity displacement
  includeAvoidedEmissions: boolean;
  uncertaintyMethod: "deterministic" | "monte_carlo";
}

// ── Heatmap ───────────────────────────────────────────────────────────

export interface HeatmapCell {
  lat: number;
  lng: number;
  supplyTonnes: number;
  demandTonnes: number;
  surplus: number; // supply - demand; positive = oversupply
  matchCount: number;
}

// ── FAOSTAT Integration ───────────────────────────────────────────────

export interface FAOResidueEstimate {
  countryCode: string;
  countryName: string;
  crop: string;
  productionTonnes: number;
  residueToProductRatio: number;
  totalResidueTonnes: number;
  availableResidueTonnes: number; // after field-use deduction
  year: number;
  source: string;
}
