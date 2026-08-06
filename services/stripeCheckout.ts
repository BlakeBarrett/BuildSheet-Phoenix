import { getFirebaseApp, getFirebaseDb } from './firebase.ts';
import { UserService } from './userService.ts';
import {
  getStripePayments,
  StripePayments,
} from '@invertase/firestore-stripe-payments';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';

/**
 * Launch promotion — auto-applied to all checkout sessions.
 *
 * Configured via VITE_STRIPE_PROMO_CODE (a Stripe PromotionCode ID, e.g.
 * "promo_..."). Left empty by default so checkout never fails on an expired
 * or invalid code. The previous hardcoded code (promo_1THXv5... / "LAUNCH100")
 * expired 1 Jul 2026 and was removed.
 */
const LAUNCH_PROMO_CODE = (import.meta.env?.VITE_STRIPE_PROMO_CODE as string | undefined) || '';

let payments: StripePayments | null = null;

/**
 * Lazily initialise the Stripe Payments SDK.
 * Uses the collection names configured in the Firebase Stripe Extension.
 */
export function getStripePaymentsInstance(): StripePayments {
  if (payments) return payments;
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase is not configured.');
  payments = getStripePayments(app, {
    productsCollection: 'products',
    customersCollection: 'customers',
  });
  return payments;
}

/**
 * Redirect the user to a Stripe Checkout session.
 *
 * Writes directly to the `customers/{uid}/checkout_sessions` Firestore
 * collection and listens for the Stripe extension to populate the session URL.
 * Unlike the SDK's `createCheckoutSession`, this surfaces the extension's
 * `error.message` immediately instead of silently timing out after 30 s.
 *
 * @param priceId  The Stripe Price ID (e.g. "price_1Qxyz...")
 */
export async function redirectToCheckout(priceId: string): Promise<void> {
  if (!UserService.isAuthenticated()) {
    throw new Error('You must be signed in to upgrade.');
  }

  const user = UserService.getCurrentUser();
  if (!user) throw new Error('No authenticated user.');

  const db = getFirebaseDb();
  if (!db) throw new Error('Firestore is not configured.');

  const sessionsRef = collection(db, 'customers', user.id, 'checkout_sessions');
  const payload: Record<string, unknown> = {
    price: priceId,
    success_url: window.location.href,
    cancel_url: window.location.href,
    automatic_tax: true,
    tax_id_collection: true,
    customer_creation: 'if_required',
  };
  if (LAUNCH_PROMO_CODE) payload.promotion_code = LAUNCH_PROMO_CODE;
  const docRef = await addDoc(sessionsRef, payload);

  // Listen for the extension to write back either a URL or an error.
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub();
      reject(new Error('Checkout session timed out after 60 s. Check that the Firebase Stripe extension is deployed and the Stripe secret key is configured.'));
    }, 60_000);

    const unsub = onSnapshot(docRef, (snap) => {
      const data = snap.data();
      if (!data) return;

      // Extension writes error.message on failure
      const error = data.error as { message?: string } | undefined;
      if (error?.message) {
        clearTimeout(timeout);
        unsub();
        reject(new Error(`Stripe error: ${error.message}`));
        return;
      }

      // Extension writes sessionId + url on success
      const url = data.url as string | undefined;
      if (url) {
        clearTimeout(timeout);
        unsub();
        window.location.assign(url);
        resolve();
      }
    }, (err) => {
      clearTimeout(timeout);
      unsub();
      reject(new Error(`Firestore listener error: ${err.message}`));
    });
  });
}
