/**
 * Feature flags for gating paid features.
 * Once paid tiers are introduced, these will check the user's plan.
 * For now, all flags return true (all features available to everyone).
 */

export const FeatureFlags = {
  /** Advanced validation checks (VIN lookup, patent verification, custom checks) */
  advancedValidation: () => true,
} as const;
