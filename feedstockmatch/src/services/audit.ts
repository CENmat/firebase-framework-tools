/**
 * FeedstockMatch — Audit Trail Service
 *
 * Implements a hash-chained, append-only audit log for compliance.
 * In production, this writes to a PostgreSQL append-only table with
 * row-level security. For MVP, we use an in-memory store.
 */

import { v4 as uuid } from "uuid";
import type { AuditEntry, AuditAction } from "../models/types.js";

// ── In-memory store (MVP) ─────────────────────────────────────────────

const auditLog: AuditEntry[] = [];
let lastChecksum = "GENESIS"; // initial chain value

// ── Checksum ──────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 checksum of the entry data.
 * Uses Web Crypto API (available in Node 20+).
 */
async function computeChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Public API ────────────────────────────────────────────────────────

export interface CreateAuditEntryInput {
  actor: string;
  action: AuditAction;
  entityType: "feedstock" | "processor" | "match" | "system";
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  ipAddress?: string;
}

/**
 * Append an audit entry to the chain.
 * Returns the created entry with computed checksums.
 */
export async function appendAuditEntry(input: CreateAuditEntryInput): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    actor: input.actor,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    previousValue: input.previousValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: input.ipAddress ?? "unknown",
    checksumPrev: lastChecksum,
    checksum: "", // computed below
  };

  // Compute checksum including the previous checksum (chain integrity)
  const payload = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    previousValue: entry.previousValue,
    newValue: entry.newValue,
    reason: entry.reason,
    checksumPrev: entry.checksumPrev,
  });

  entry.checksum = await computeChecksum(payload);
  lastChecksum = entry.checksum;

  auditLog.push(entry);
  return entry;
}

/**
 * Get audit entries for an entity.
 */
export function getAuditTrail(entityId: string): AuditEntry[] {
  return auditLog.filter((e) => e.entityId === entityId);
}

/**
 * Get all audit entries (with pagination).
 */
export function getAllAuditEntries(offset = 0, limit = 100): { entries: AuditEntry[]; total: number } {
  return {
    entries: auditLog.slice(offset, offset + limit),
    total: auditLog.length,
  };
}

/**
 * Verify the integrity of the audit chain.
 * Returns true if all checksums are consistent.
 */
export async function verifyChainIntegrity(): Promise<{
  valid: boolean;
  brokenAt?: number;
  totalEntries: number;
}> {
  if (auditLog.length === 0) {
    return { valid: true, totalEntries: 0 };
  }

  let prevChecksum = "GENESIS";

  for (let i = 0; i < auditLog.length; i++) {
    const entry = auditLog[i];

    // Verify previous checksum link
    if (entry.checksumPrev !== prevChecksum) {
      return { valid: false, brokenAt: i, totalEntries: auditLog.length };
    }

    // Recompute checksum
    const payload = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      reason: entry.reason,
      checksumPrev: entry.checksumPrev,
    });

    const computed = await computeChecksum(payload);
    if (computed !== entry.checksum) {
      return { valid: false, brokenAt: i, totalEntries: auditLog.length };
    }

    prevChecksum = entry.checksum;
  }

  return { valid: true, totalEntries: auditLog.length };
}

/**
 * Export audit entries as CSV string.
 */
export function exportAuditCSV(entries: AuditEntry[]): string {
  const headers = [
    "id",
    "timestamp",
    "actor",
    "action",
    "entityType",
    "entityId",
    "reason",
    "checksumPrev",
    "checksum",
  ];

  const rows = entries.map((e) =>
    [
      e.id,
      e.timestamp,
      e.actor,
      e.action,
      e.entityType,
      e.entityId,
      `"${e.reason.replace(/"/g, '""')}"`,
      e.checksumPrev,
      e.checksum,
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}
