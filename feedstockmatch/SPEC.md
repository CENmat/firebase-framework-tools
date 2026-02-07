# FeedstockMatch — Platform Specification

**Version**: 1.0.0-MVP
**Date**: 2026-02-07
**Status**: Design + MVP Implementation

---

## 1. Why This Doesn't Exist

The circular bioeconomy has a **missing middle**: organic byproducts (food waste,
agricultural residues, forestry residues) are generated at predictable volumes, and
processors (composters, anaerobic digesters, biorefineries) have predictable intake
capacity — yet no platform connects them with transparent lifecycle impact data.

### The gap today

| What exists | What's missing |
|---|---|
| Waste broker spreadsheets | Real-time supply/demand matching with geospatial routing |
| Siloed LCA databases (ecoinvent, GREET) | Transparent per-match GHG + contamination estimates accessible to non-experts |
| Permit databases per jurisdiction | Compliance-ready audit trail that crosses jurisdictional boundaries |
| FAOSTAT production data | Integration of residue ratios → available feedstock estimates |
| IEA bioenergy statistics | Actionable facility-level matching against regional context |
| OSM routing | Transport emission calculation layered on top of routing |

**The workflow that doesn't exist**: A food processor in Iowa with 200 tonnes/month
of spent grain cannot today (a) see which AD facilities within 150 km have intake
capacity, (b) get a GHG estimate for the match including transport, (c) verify
contamination compatibility, and (d) generate a compliance audit record — in one
place, in under 5 minutes.

FeedstockMatch solves this.

---

## 2. Core Concepts

### 2.1 Feedstock (Supply Side)

A **Feedstock Listing** represents an organic byproduct available for processing:

- **Source type**: Food waste (pre-consumer, post-consumer), agricultural residue
  (straw, husks, stalks, manure), forestry residue (bark, sawdust, slash).
- **Volume**: tonnes/month, with seasonal variation profile.
- **Composition**: moisture %, C:N ratio, dry matter %, contamination flags.
- **Location**: lat/lng + address, with optional geofence for pickup zone.
- **Availability window**: start date, end date or ongoing, pickup schedule.
- **Certifications/flags**: organic, non-GMO, known contaminants, regulatory status.

### 2.2 Processor (Demand Side)

A **Processor Listing** represents a facility that converts organic byproducts:

- **Technology type**: Composting (windrow, in-vessel, vermicompost), Anaerobic
  Digestion (wet, dry, thermophilic, mesophilic), Biorefinery (ethanol, biochemical,
  pyrolysis, gasification), Animal Feed processing.
- **Intake capacity**: tonnes/month remaining, with seasonal variation.
- **Accepted feedstocks**: list of compatible source types + composition ranges.
- **Contamination tolerances**: max moisture, min C:N, prohibited substances.
- **Location**: lat/lng + address + service radius.
- **Certifications**: permits, organic-certified, RFS pathway, ISCC, RSB.

### 2.3 Match

A **Match** pairs a Feedstock with a Processor and computes:

- **Compatibility score** (0–100): composition fit, contamination risk, volume fit.
- **Transport estimate**: distance (km), mode, CO₂e from transport.
- **Net GHG impact**: avoided emissions vs. baseline (landfill/open burning) minus
  transport emissions minus processing emissions.
- **Contamination risk level**: LOW / MEDIUM / HIGH / REJECT.
- **Audit record**: immutable log entry for compliance.

---

## 3. LCA Methodology — Transparency

### 3.1 System Boundary

```
[Feedstock generation] → [Collection & Transport] → [Processing] → [Product/Energy output]
         ↓                        ↓                       ↓                  ↓
   Baseline scenario        Transport GHG           Process GHG        Avoided emissions
   (landfill/burn)         (fuel × distance)      (energy, fugitive)   (displaces fossil/
                                                                        synthetic fertilizer)
```

### 3.2 Baseline Scenarios (What Would Happen Without FeedstockMatch)

| Feedstock type | Default baseline | GHG factor (kg CO₂e/tonne) | Source |
|---|---|---|---|
| Food waste | Landfill with partial gas capture | 580 | EPA WARM v16 |
| Food waste | Open dump (no capture) | 1,100 | IPCC 2019 refinement |
| Crop residues | Open field burning | 92 (CO₂e from CH₄+N₂O) | IPCC EF for ag burning |
| Crop residues | Left on field (incorporation) | -12 (soil C benefit) | IPCC tier 1 |
| Forestry residues | Slash pile burning | 110 | US EPA AP-42 |
| Forestry residues | Decay in place | 15 (slow CH₄) | IPCC wetland guidance |
| Manure | Lagoon storage | 340 | EPA AgSTAR |

Users can override baseline selection per listing. Every override is logged in audit.

### 3.3 Transport Emissions

```
Transport CO₂e = Distance(km) × Load(tonnes) × EmissionFactor(mode)
```

| Mode | Factor (kg CO₂e / tonne-km) | Source |
|---|---|---|
| Diesel truck (full) | 0.062 | GLEC Framework v3 |
| Diesel truck (avg load) | 0.089 | GLEC Framework v3 |
| Rail | 0.022 | GLEC Framework v3 |
| Barge | 0.016 | GLEC Framework v3 |

- Distance sourced from OpenStreetMap Routing (OSRM) for road, with fallback to
  Haversine × 1.3 detour factor.
- Round-trip vs. one-way selectable; default = one-way (backhaul assumed occupied).

### 3.4 Processing Emissions

| Technology | Emission factor (kg CO₂e/tonne input) | Source |
|---|---|---|
| Composting (windrow) | 55 | IPCC 2006 GL, Ch 4 |
| Composting (in-vessel) | 32 | Boldrin et al. 2009 |
| AD (mesophilic, enclosed) | 18 + fugitive CH₄ leak rate × 25 | IPCC 2019 |
| AD (thermophilic) | 22 + fugitive CH₄ leak rate × 25 | IPCC 2019 |
| Biorefinery (ethanol) | 85 | GREET 2024 |
| Pyrolysis | 45 (net, incl. biochar credit) | Woolf et al. 2010 |

### 3.5 Avoided Emissions (Credits)

| Output | Displaced product | Credit (kg CO₂e/unit) | Source |
|---|---|---|---|
| Biogas → electricity | Grid marginal (region) | Varies by grid factor | IEA EF by country |
| Biogas → RNG | Natural gas | 2.75 / m³ | EPA |
| Compost | Synthetic N fertilizer | 6.1 / kg N content | ecoinvent 3.9 |
| Biochar | Sequestration | 2,500 / tonne biochar | Woolf et al. |
| Ethanol | Gasoline | 2,310 / m³ ethanol | GREET 2024 |

### 3.6 Net Impact Formula

```
Net GHG Impact = Baseline_emissions
               - Transport_emissions
               - Processing_emissions
               + Avoided_emissions

If Net > 0 → net climate benefit (green)
If Net < 0 → net climate cost (red)
```

### 3.7 Uncertainty & Sensitivity

Every estimate is presented with:
- **Central estimate** (deterministic, using factors above)
- **Range** (±30% default, or Monte Carlo if user opts in)
- **Sensitivity bars**: which parameter dominates uncertainty
- **Data quality indicator**: 1 (measured) → 5 (default/estimated)

All factors, sources, and assumptions are visible in the UI via an expandable
"Methodology" panel on every match card.

---

## 4. Contamination & Safety

### 4.1 Contamination Risk Matrix

| Contaminant | Threshold | Risk if exceeded | Check method |
|---|---|---|---|
| Heavy metals (Cd, Pb, Hg) | Per local reg (e.g., EU 2019/1009) | HIGH → REJECT | Lab cert required |
| Plastic fragments | >0.5% by weight | MEDIUM | Visual + density sort |
| Pesticide residue | Per MRL tables | MEDIUM–HIGH | Lab cert or supplier attestation |
| Pathogens (E. coli, Salmonella) | Process-dependent | HIGH if composting | Time-temp log required |
| Moisture content | Process-specific range | LOW (efficiency) | On-site measurement |
| C:N ratio | Process-specific range | LOW (efficiency) | Lab or estimate from type |
| pH | Process-specific range | LOW–MEDIUM | On-site measurement |

### 4.2 Safety Checklist (per match)

The system auto-generates a checklist:

1. ☐ Feedstock composition within processor tolerance ranges
2. ☐ No prohibited contaminants flagged
3. ☐ Lab certification uploaded (if required by risk level)
4. ☐ Transport permits verified for jurisdiction
5. ☐ Processor intake permit covers feedstock type
6. ☐ Insurance/liability coverage confirmed
7. ☐ Seasonal variation within processor buffer capacity

Each checklist item has status: PASS / FAIL / NEEDS_REVIEW / NOT_APPLICABLE.

---

## 5. Compliance & Audit Trail

### 5.1 Audit Record Structure

Every match, every status change, every parameter override produces an immutable
audit entry:

```typescript
interface AuditEntry {
  id: string;               // UUID v4
  timestamp: string;        // ISO 8601
  actor: string;            // user ID or "system"
  action: AuditAction;      // enum: MATCH_CREATED, PARAM_OVERRIDE, STATUS_CHANGE, ...
  entityType: string;       // "feedstock" | "processor" | "match"
  entityId: string;
  previousValue: any;
  newValue: any;
  reason: string;           // required for overrides
  ipAddress: string;
  geoLocation?: string;
  checksumPrev: string;     // SHA-256 of previous entry → chain integrity
  checksum: string;         // SHA-256 of this entry
}
```

### 5.2 Chain Integrity

Audit entries form a hash chain (each entry's checksum includes the previous
entry's checksum). This provides tamper evidence without requiring a blockchain.
Periodic checkpoints are signed with the platform's key.

### 5.3 Regulatory Mapping

The platform maps requirements to jurisdictions:
- **EU**: Waste Framework Directive, EU Fertilising Products Reg 2019/1009
- **US**: EPA RCRA subtitle D, state-level composting permits, RFS2 pathway regs
- **Canada**: provincial waste diversion acts

---

## 6. Data Source Integration

### 6.1 FAOSTAT

- **Purpose**: Baseline crop production volumes → estimate residue availability by
  region using residue-to-product ratios (RPR).
- **Integration**: REST API calls to FAOSTAT bulk download endpoints for crop
  production data. Cached locally, refreshed quarterly.
- **Example**: If FAOSTAT shows Iowa produced 55M tonnes of corn, and stover RPR
  is 1.0, then ~55M tonnes of stover is theoretically available (adjusted for
  current field-use rates of ~40%, leaving ~33M tonnes potentially available).

### 6.2 IEA Bioenergy

- **Purpose**: Regional context for bioenergy capacity, policy landscape, technology
  deployment rates.
- **Integration**: Reference data curated from IEA bioenergy publications.
  Contextual overlays on the map showing bioenergy policy zones and existing
  capacity.

### 6.3 OpenStreetMap / OSRM

- **Purpose**: Road routing for transport distance and time estimation.
- **Integration**: Self-hosted or public OSRM instance for route calculation.
  Fallback to Haversine × detour factor if routing unavailable.
- **Privacy**: No user data sent to third parties; routing queries contain only
  coordinates.

---

## 7. Pricing Model

### 7.1 Tiers

| Tier | Monthly Price | Included | Target |
|---|---|---|---|
| **Explorer** | Free | 5 matches/month, public data only, no audit export | Individual researchers, students |
| **Operator** | $149/month | 50 matches/month, full audit trail, CSV export, 2 users | Single-site operators |
| **Enterprise** | $499/month | Unlimited matches, API access, SSO, priority support, 10 users | Multi-site processors, municipalities |
| **Platform** | Custom | White-label, custom integrations, SLA | Waste management companies, governments |

### 7.2 Transaction Fee (Optional)

- 1.5% of contracted feedstock value on matches that convert to transactions.
- Only applies if parties use FeedstockMatch's built-in contracting module.

### 7.3 Unit Economics (MVP Target)

- Infrastructure cost per match: ~$0.02 (compute + routing + storage)
- Target gross margin: >80% on Operator and Enterprise tiers.
- Break-even: ~200 Operator-tier accounts or ~60 Enterprise accounts.

---

## 8. MVP Architecture

### 8.1 Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | TypeScript + Leaflet.js + Chart.js | Map-native, lightweight, no framework lock-in for MVP |
| Backend API | Node.js + Express + TypeScript | Matches existing repo stack |
| Database | PostgreSQL + PostGIS | Geospatial queries for proximity matching |
| Cache | Redis | Session, rate limiting, hot match cache |
| Routing | OSRM (self-hosted or demo server) | OSM-based transport distance |
| Auth | Firebase Auth | Fits repo context |
| Hosting | Firebase App Hosting | Fits repo context |
| Audit storage | PostgreSQL (append-only table) + periodic S3 archive | Immutability via DB triggers |

### 8.2 API Routes

```
POST   /api/feedstocks              Create feedstock listing
GET    /api/feedstocks              List/search feedstocks
GET    /api/feedstocks/:id          Get feedstock detail
PUT    /api/feedstocks/:id          Update feedstock listing
DELETE /api/feedstocks/:id          Soft-delete feedstock listing

POST   /api/processors             Create processor listing
GET    /api/processors              List/search processors
GET    /api/processors/:id          Get processor detail
PUT    /api/processors/:id          Update processor listing
DELETE /api/processors/:id          Soft-delete processor listing

GET    /api/matches                 Get matches for current user
POST   /api/matches/compute         Compute match for feedstock ↔ processor pair
POST   /api/matches/:id/accept      Accept a match
POST   /api/matches/:id/reject      Reject a match

GET    /api/audit/:entityId         Get audit trail for entity
GET    /api/audit/export            Export audit trail (CSV/JSON)

GET    /api/impact/:matchId         Get detailed LCA breakdown
POST   /api/impact/scenario         Run scenario (slider parameters)

GET    /api/data/faostat/residues   Get FAOSTAT residue estimates by region
GET    /api/data/heatmap            Get supply/demand heatmap data

GET    /api/health                  Health check
```

### 8.3 Deployment

```
┌─────────────────────────────────────────────────────┐
│                  Firebase App Hosting                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ Static   │  │ Express  │  │ Background Jobs   │ │
│  │ Frontend │  │ API      │  │ (Cloud Functions) │ │
│  │ (CDN)    │  │ (Cloud   │  │ - FAOSTAT sync    │ │
│  │          │  │  Run)    │  │ - Audit archive   │ │
│  └──────────┘  └────┬─────┘  └───────────────────┘ │
│                     │                                │
│              ┌──────┴──────┐                        │
│              │ Cloud SQL   │                        │
│              │ PostgreSQL  │                        │
│              │ + PostGIS   │                        │
│              └─────────────┘                        │
└─────────────────────────────────────────────────────┘
```
