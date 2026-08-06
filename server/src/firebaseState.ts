/**
 * Firebase Admin availability state.
 *
 * Lives in its own module to avoid the index.ts <-> routes circular import.
 * `markFirebaseReady()` MUST be called after a successful getFirestore().
 */
export let firebaseInitialized = false;
export let firebaseErrorMessage = '';

export function markFirebaseReady(): void {
  firebaseInitialized = true;
  firebaseErrorMessage = '';
}

export function markFirebaseFailed(message: string): void {
  firebaseInitialized = false;
  firebaseErrorMessage = message || 'Firebase unavailable';
}
