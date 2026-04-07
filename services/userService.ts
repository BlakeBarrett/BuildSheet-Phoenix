import { User } from '../types.ts';
import { signInWithPopup, signOut, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, deleteUser, type Unsubscribe } from 'firebase/auth';
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from './firebase.ts';

/** localStorage key used to remember the email between send → click. */
const EMAIL_LINK_KEY = 'buildsheet_email_for_signin';

/**
 * UserService – Firebase Auth (Google + Passwordless Email Link) with a guest fallback.
 *
 * When Firebase is configured the service delegates to `signInWithPopup`
 * and `onAuthStateChanged`. When it is not (local dev / missing env vars)
 * the service falls back to a localStorage-based anonymous session so the
 * rest of the app keeps working.
 */
export class UserService {
  private static currentUser: User | null = null;
  private static listeners: ((user: User | null) => void)[] = [];
  private static initialized = false;
  private static authUnsub: Unsubscribe | null = null;
  private static loginInProgress = false;

  private static setUserFromFirebase(firebaseUser: any) {
    this.currentUser = {
      id: firebaseUser.uid,
      username: firebaseUser.displayName?.toLowerCase().replace(/\s+/g, '.') || firebaseUser.uid.substring(0, 12),
      name: firebaseUser.displayName || 'Authenticated User',
      email: firebaseUser.email || '',
      avatar: firebaseUser.photoURL || '',
    };
  }

  static initialize() {
    if (this.initialized) return;
    this.initialized = true;

    const auth = getFirebaseAuth();
    if (auth) {
      // Real Firebase listener – fires on page load with the cached credential.
      this.authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          this.setUserFromFirebase(firebaseUser);
        } else {
          this.currentUser = null;
        }
        this.notifyListeners();
      });
    } else {
      // No Firebase config – stay anonymous (guest) mode.
      this.currentUser = null;
      this.notifyListeners();
    }
  }

  static getCurrentUser(): User | null {
    if (!this.initialized) this.initialize();
    return this.currentUser;
  }

  /** Returns true when the active user was authenticated via Firebase. */
  static isAuthenticated(): boolean {
    return !!this.currentUser && isFirebaseConfigured();
  }

  /** Returns true while an explicit login or email-link sign-in is in progress. */
  static isLoginInProgress(): boolean {
    return this.loginInProgress;
  }

  static async login(): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) {
      console.warn('Firebase is not configured – login unavailable.');
      return;
    }
    this.loginInProgress = true;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // Set currentUser immediately from the result rather than waiting
      // for onAuthStateChanged, which may fire in a later microtask.
      if (result.user) {
        this.setUserFromFirebase(result.user);
        this.notifyListeners();
      }
    } catch (e) {
      this.loginInProgress = false;
      throw e;
    }
  }

  /** Call after post-login work (migration, Firestore load) is complete. */
  static loginComplete(): void {
    this.loginInProgress = false;
  }

  // --- Passwordless Email Link ---

  /**
   * Send a sign-in link to the provided email address.
   * The link points back to the current page so `completeEmailLinkSignIn`
   * can finish the flow on return.
   */
  static async sendEmailLink(email: string): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) {
      console.warn('Firebase is not configured – email link unavailable.');
      return;
    }
    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    // Persist the email so we can complete sign-in when the user returns.
    localStorage.setItem(EMAIL_LINK_KEY, email);
  }

  /**
   * If the current URL is an email sign-in link, complete the flow.
   * Returns `true` if sign-in was attempted/completed, `false` otherwise.
   */
  static async completeEmailLinkSignIn(): Promise<boolean> {
    const auth = getFirebaseAuth();
    if (!auth) return false;
    if (!isSignInWithEmailLink(auth, window.location.href)) return false;

    let email = localStorage.getItem(EMAIL_LINK_KEY);
    if (!email) {
      // If the user opened the link on a different device / browser the
      // stored email won't be present.  Prompt for it.
      email = window.prompt('Please confirm your email address for sign-in:');
      if (!email) return false;
    }

    this.loginInProgress = true;
    try {
      const result = await signInWithEmailLink(auth, email, window.location.href);
      // Set currentUser immediately from the result.
      if (result.user) {
        this.setUserFromFirebase(result.user);
        this.notifyListeners();
      }
    } catch (e) {
      this.loginInProgress = false;
      throw e;
    }
    localStorage.removeItem(EMAIL_LINK_KEY);

    // Clean the sign-in link params from the URL so a page refresh doesn't
    // trigger the flow again.
    if (window.history?.replaceState) {
      const clean = window.location.origin + window.location.pathname;
      window.history.replaceState(null, '', clean);
    }
    return true;
  }

  static async logout(): Promise<void> {
    const auth = getFirebaseAuth();
    if (auth) {
      await signOut(auth);
    }
    // onAuthStateChanged will set currentUser = null
  }

  /**
   * Permanently delete the current user's Firebase Auth account.
   * This is a destructive, irreversible action. The caller should
   * confirm with the user beforehand and handle Firestore data cleanup.
   */
  static async deleteAccount(): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) {
      throw new Error('No authenticated user to delete.');
    }
    await deleteUser(auth.currentUser);
    // onAuthStateChanged fires → currentUser = null
  }

  static onUserChange(callback: (user: User | null) => void) {
    if (!this.initialized) this.initialize();
    this.listeners.push(callback);
    // Immediately fire with current state
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private static notifyListeners() {
    this.listeners.forEach(l => l(this.currentUser));
  }
}