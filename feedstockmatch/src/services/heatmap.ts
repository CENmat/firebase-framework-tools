/**
 * FeedstockMatch — Supply/Demand Heatmap Generator
 *
 * Aggregates feedstock supply and processor demand into grid cells
 * for visualization on the map.
 */

import type { Feedstock, Processor, HeatmapCell, GeoPoint } from "../models/types.js";

const DEFAULT_CELL_SIZE_DEG = 0.5; // ~55 km at equator

/**
 * Generate heatmap cells from feedstock and processor data.
 */
export function generateHeatmap(
  feedstocks: Feedstock[],
  processors: Processor[],
  cellSizeDeg: number = DEFAULT_CELL_SIZE_DEG
): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();

  const cellKey = (lat: number, lng: number): string => {
    const snapLat = Math.floor(lat / cellSizeDeg) * cellSizeDeg;
    const snapLng = Math.floor(lng / cellSizeDeg) * cellSizeDeg;
    return `${snapLat},${snapLng}`;
  };

  const getOrCreateCell = (point: GeoPoint): HeatmapCell => {
    const key = cellKey(point.lat, point.lng);
    if (!cells.has(key)) {
      const snapLat = Math.floor(point.lat / cellSizeDeg) * cellSizeDeg + cellSizeDeg / 2;
      const snapLng = Math.floor(point.lng / cellSizeDeg) * cellSizeDeg + cellSizeDeg / 2;
      cells.set(key, {
        lat: snapLat,
        lng: snapLng,
        supplyTonnes: 0,
        demandTonnes: 0,
        surplus: 0,
        matchCount: 0,
      });
    }
    return cells.get(key)!;
  };

  // Aggregate supply
  for (const f of feedstocks) {
    if (f.status !== "active") continue;
    const cell = getOrCreateCell(f.location);
    cell.supplyTonnes += f.volumeTonnesPerMonth;
  }

  // Aggregate demand
  for (const p of processors) {
    if (p.status !== "active") continue;
    const availableCapacity = p.intakeCapacityTonnesPerMonth * (1 - p.currentUtilizationPct / 100);
    const cell = getOrCreateCell(p.location);
    cell.demandTonnes += availableCapacity;
  }

  // Compute surplus and return
  for (const cell of cells.values()) {
    cell.surplus = cell.supplyTonnes - cell.demandTonnes;
  }

  return Array.from(cells.values());
}
