/**
 * FeedstockMatch — Routing & Distance Service
 *
 * Uses OSRM (OpenStreetMap Routing Machine) for accurate road distances.
 * Falls back to Haversine × detour factor if OSRM is unavailable.
 *
 * OSRM integration plan:
 *   - MVP: Use public OSRM demo server (rate-limited, not for production)
 *   - Production: Self-host OSRM with regional OSM extracts
 *   - See: https://wiki.openstreetmap.org/wiki/Databases_and_data_access_APIs
 */

import type { GeoPoint } from "../models/types.js";

const EARTH_RADIUS_KM = 6371;
const HAVERSINE_DETOUR_FACTOR = 1.3; // road distance ≈ 1.3 × straight-line distance

// OSRM demo server (for MVP/development only)
const OSRM_BASE_URL = "https://router.project-osrm.org";

export interface RouteResult {
  distanceKm: number;
  durationMinutes?: number;
  source: "osrm" | "haversine_fallback";
}

/**
 * Calculate straight-line distance between two points (Haversine formula).
 */
export function calculateDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Estimate road distance and duration using OSRM.
 * Falls back to Haversine × detour factor if OSRM is unavailable.
 */
export async function estimateRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  // In production, set OSRM_ENABLED=true to use OSRM routing.
  // In dev/CI environments without network access, use Haversine fallback.
  if (process.env.OSRM_ENABLED === "true") {
    try {
      const result = await queryOSRM(from, to);
      return result;
    } catch {
      // fall through to Haversine
    }
  }

  const straightLine = calculateDistance(from, to);
  return {
    distanceKm: Math.round(straightLine * HAVERSINE_DETOUR_FACTOR * 10) / 10,
    source: "haversine_fallback",
  };
}

/**
 * Query OSRM for driving distance and duration.
 *
 * OSRM API docs: http://project-osrm.org/docs/v5.24.0/api/
 * OSM data access: https://wiki.openstreetmap.org/wiki/Databases_and_data_access_APIs
 *
 * In production, replace OSRM_BASE_URL with self-hosted instance using
 * regional OSM extracts from Geofabrik (https://download.geofabrik.de/).
 */
async function queryOSRM(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  const url = `${OSRM_BASE_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "FeedstockMatch/1.0 (contact@feedstockmatch.io)" },
    });

    if (!response.ok) {
      throw new Error(`OSRM returned ${response.status}`);
    }

    const data = (await response.json()) as {
      code: string;
      routes: Array<{ distance: number; duration: number }>;
    };

    if (data.code !== "Ok" || !data.routes.length) {
      throw new Error("OSRM returned no routes");
    }

    const route = data.routes[0];
    return {
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMinutes: Math.round(route.duration / 60),
      source: "osrm",
    };
  } finally {
    clearTimeout(timeout);
  }
}
