import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { TierService, PLAN_LIMITS, type PlanTier, type PlanLimits, type TierState } from '../services/tierService.ts';
import { UserService } from '../services/userService.ts';

// --- Hook ---

export interface UseTierResult {
  /** Current plan tier. */
  tier: PlanTier;
  /** True while the subscription doc is still loading. */
  loading: boolean;
  /** True when the user is authenticated via Firebase. */
  isAuthenticated: boolean;
  /** Resolved limits (accounts for anonymous vs authenticated free). */
  limits: PlanLimits;
  /** Convenience flags */
  canAudit: boolean;
  canExportCAD: boolean;
  canExportJSON: boolean;
  canExportCSV: boolean;
  canExportPDF: boolean;
  hasUnlimitedProjects: boolean;
  hasARGuide: boolean;
  hasVoiceMode: boolean;
  hasFolders: boolean;
  /** Effective project cap for the current user. */
  maxProjects: number;
  /** Effective message caps for the current user. */
  maxArchitectMessages: number;
  maxValidatorCalls: number;
  maxPlannerCalls: number;
}

export function useTier(): UseTierResult {
  const [tierState, setTierState] = useState<TierState>(TierService.getState());

  useEffect(() => {
    // Listen to auth changes and wire up TierService accordingly
    const unsubAuth = UserService.onUserChange((user) => {
      if (user && UserService.isAuthenticated()) {
        TierService.subscribe(user.id);
      } else {
        TierService.setAnonymous();
      }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    const unsub = TierService.onChange(setTierState);
    return unsub;
  }, []);

  return useMemo(() => {
    const baseLimits = PLAN_LIMITS[tierState.tier];
    const isAuth = tierState.isAuthenticated;

    // Anonymous free users get stricter limits
    const limits: PlanLimits = tierState.tier === 'free' && !isAuth
      ? {
          ...baseLimits,
          maxProjects: 1,
          maxArchitectMessages: 3,
          maxValidatorCalls: 1,
          maxPlannerCalls: 1,
          canExportJSON: false,    // no exports for unauthenticated
          canExportCSV: false,
          canExportPDF: false,
          canExportCAD: false,
        }
      : baseLimits;

    return {
      tier: tierState.tier,
      loading: tierState.loading,
      isAuthenticated: isAuth,
      limits,
      canAudit: limits.canAudit,
      canExportCAD: limits.canExportCAD,
      canExportJSON: limits.canExportJSON,
      canExportCSV: limits.canExportCSV,
      canExportPDF: limits.canExportPDF,
      hasUnlimitedProjects: limits.hasUnlimitedProjects,
      hasARGuide: limits.hasARGuide,
      hasVoiceMode: limits.hasVoiceMode,
      hasFolders: limits.hasFolders,
      maxProjects: limits.maxProjects,
      maxArchitectMessages: limits.maxArchitectMessages,
      maxValidatorCalls: limits.maxValidatorCalls,
      maxPlannerCalls: limits.maxPlannerCalls,
    };
  }, [tierState]);
}

// --- TierGuard Component ---

interface TierGuardProps {
  /** Minimum tier required to render children. */
  tier: PlanTier;
  /** Content shown when the user does not meet the tier requirement. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally renders children only if the user's plan meets or exceeds
 * the required tier. Shows `fallback` (or nothing) otherwise.
 */
export function TierGuard({ tier: requiredTier, fallback = null, children }: TierGuardProps) {
  const { tier, loading } = useTier();

  if (loading) return null;

  const tierRank: Record<PlanTier, number> = { free: 0, pro: 1, enterprise: 2 };
  if (tierRank[tier] >= tierRank[requiredTier]) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
