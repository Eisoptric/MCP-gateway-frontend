"use client";

// Eisoptric has no plans or feature gates: every account has every feature.
export function useEntitlements() {
  return {
    policies: true,
    webhooks: true,
    groups: true,
    toolSetLimit: null as number | null,
    auditFull: true,
  };
}
