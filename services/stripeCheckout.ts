import { getFirebaseApp } from './firebase.ts';
import { UserService } from './userService.ts';
import {
  getStripePayments,
  createCheckoutSession,
  StripePayments,
} from '@invertase/firestore-stripe-payments';

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
 * Uses the **@invertase/firestore-stripe-payments** SDK which writes to
 * `customers/{uid}/checkout_sessions` and waits for the Stripe extension
 * to populate the session URL.
 *
 * @param priceId  The Stripe Price ID (e.g. "price_1Qxyz...")
 */
export async function redirectToCheckout(priceId: string): Promise<void> {
  if (!UserService.isAuthenticated()) {
    throw new Error('You must be signed in to upgrade.');
  }

  const stripePayments = getStripePaymentsInstance();

  const session = await createCheckoutSession(stripePayments, {
    price: priceId,
    success_url: window.location.href,
    cancel_url: window.location.href,
    automatic_tax: true,
    tax_id_collection: true,
  } as any);

  window.location.assign(session.url);
}
