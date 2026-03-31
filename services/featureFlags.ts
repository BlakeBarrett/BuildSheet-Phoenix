/**
 * Feature flags for gating paid features.
 * These now check the user's plan via TierService.
 * Falls back to `true` when TierService hasn't loaded yet (loading state).
 */

import { TierService, PLAN_LIMITS } from './tierService.ts';

export const FeatureFlags = {
  /** Advanced validation checks (VIN lookup, patent verification, custom checks) */
  advancedValidation: () => {
    const state = TierService.getState();
    if (state.loading) return true; // graceful: allow while loading
    return PLAN_LIMITS[state.tier].canAudit;
  },
} as const;
