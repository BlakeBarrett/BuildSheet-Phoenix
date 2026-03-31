import { getFirebaseDb } from './firebase.ts';
import { UserService } from './userService.ts';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { onCurrentUserSubscriptionUpdate } from '@invertase/firestore-stripe-payments';
import { getStripePaymentsInstance } from './stripeCheckout.ts';

// --- Plan Tier Definitions ---

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  maxProjects: number;           // max active (non-archived) projects
  maxArchitectMessages: number;  // per-session chat messages
  maxValidatorCalls: number;     // per-session audit calls
  maxPlannerCalls: number;       // per-session assembly plan calls
  canAudit: boolean;
  canExportCAD: boolean;
  canExportCSV: boolean;
  canExportPDF: boolean;
  canExportJSON: boolean;
  hasUnlimitedProjects: boolean;
  hasARGuide: boolean;
  hasVoiceMode: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    maxProjects: 3,              // 3 for authenticated, 1 for anonymous (handled in hook)
    maxArchitectMessages: 7,     // 7 for authenticated, 3 for anonymous
    maxValidatorCalls: 3,        // 3 for authenticated, 1 for anonymous
    maxPlannerCalls: 3,          // 3 for authenticated, 1 for anonymous
    canAudit: true,
    canExportCAD: false,
    canExportCSV: false,
    canExportPDF: false,
    canExportJSON: true,         // only for authenticated; anonymous gets none
    hasUnlimitedProjects: false,
    hasARGuide: false,
    hasVoiceMode: false,
  },
  pro: {
    maxProjects: Infinity,
    maxArchitectMessages: Infinity,
    maxValidatorCalls: Infinity,
    maxPlannerCalls: Infinity,
    canAudit: true,
    canExportCAD: true,
    canExportCSV: true,
    canExportPDF: true,
    canExportJSON: true,
    hasUnlimitedProjects: true,
    hasARGuide: true,
    hasVoiceMode: true,
  },
  enterprise: {
    maxProjects: Infinity,
    maxArchitectMessages: Infinity,
    maxValidatorCalls: Infinity,
    maxPlannerCalls: Infinity,
    canAudit: true,
    canExportCAD: true,
    canExportCSV: true,
    canExportPDF: true,
    canExportJSON: true,
    hasUnlimitedProjects: true,
    hasARGuide: true,
    hasVoiceMode: true,
  },
};

// --- Subscription Listener ---

export interface TierState {
  tier: PlanTier;
  isAuthenticated: boolean;
  loading: boolean;
}

/**
 * TierService reads the user's `planTier` from their Firestore user doc
 * and listens for active Stripe subscriptions via the
 * @invertase/firestore-stripe-payments SDK (path: `customers/{uid}/subscriptions`).
 */
export class TierService {
  private static listeners: ((state: TierState) => void)[] = [];
  private static currentState: TierState = { tier: 'free', isAuthenticated: false, loading: true };
  private static unsubscribers: Unsubscribe[] = [];

  /** Start listening to the authenticated user's tier. Call once on auth change. */
  static subscribe(uid: string): void {
    this.cleanup();
    this.currentState = { tier: 'free', isAuthenticated: true, loading: true };
    this.notify();

    const db = getFirebaseDb();
    if (!db) {
      this.currentState = { tier: 'free', isAuthenticated: true, loading: false };
      this.notify();
      return;
    }

    // 1. Listen to user doc for planTier override (manual admin grant)
    const userDocRef = doc(db, 'users', uid);
    const unsubUser = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.planTier && ['pro', 'enterprise'].includes(data.planTier)) {
          this.currentState = { tier: data.planTier as PlanTier, isAuthenticated: true, loading: false };
          this.notify();
          return;
        }
      }
      // If no override, fall through to subscription check
    }, (err) => {
      console.error('TierService: user doc listener error', err);
    });
    this.unsubscribers.push(unsubUser);

    // 2. Listen to Stripe subscriptions via the Invertase SDK
    //    This watches `customers/{uid}/subscriptions` automatically.
    try {
      const payments = getStripePaymentsInstance();
      const unsubSubs = onCurrentUserSubscriptionUpdate(payments, (snapshot) => {
        let highestTier: PlanTier = 'free';

        for (const change of snapshot.changes) {
          const sub = change.subscription;
          const isActive = sub.status === 'active' || sub.status === 'trialing';
          if (!isActive) continue;

          // Determine tier from the subscription's role or product metadata
          const role = (sub as any).role
            || (sub as any).metadata?.planTier
            || 'pro';

          if (role === 'enterprise') highestTier = 'enterprise';
          else if (role === 'pro' && highestTier !== 'enterprise') highestTier = 'pro';
        }

        // Only upgrade from subscription if user doc didn't already set a higher tier
        if (this.currentState.tier === 'free' || this.currentState.loading) {
          this.currentState = { tier: highestTier, isAuthenticated: true, loading: false };
        } else {
          this.currentState = { ...this.currentState, loading: false };
        }
        this.notify();
      });
      this.unsubscribers.push(unsubSubs);
    } catch (err) {
      console.error('TierService: failed to subscribe to Stripe updates', err);
      this.currentState = { ...this.currentState, loading: false };
      this.notify();
    }
  }

  /** Clear subscription for logged-out / anonymous user. */
  static setAnonymous(): void {
    this.cleanup();
    this.currentState = { tier: 'free', isAuthenticated: false, loading: false };
    this.notify();
  }

  static getState(): TierState {
    return { ...this.currentState };
  }

  static onChange(callback: (state: TierState) => void): () => void {
    this.listeners.push(callback);
    callback(this.currentState);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private static cleanup(): void {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
  }

  private static notify(): void {
    this.listeners.forEach(l => l(this.currentState));
  }
}
