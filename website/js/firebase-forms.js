/* ============================================
   BuildSheet Marketing — Firebase Forms
   Writes newsletter subscriptions and contact-sales
   inquiries to Firestore instead of mailto: links.
   ============================================ */

// Firebase SDK loaded via CDN modules in index.html sets these on globalThis:
//   firebase/app  → initializeApp
//   firebase/firestore → getFirestore, collection, addDoc, serverTimestamp

let _db = null;

/**
 * Lazy-init Firebase and return the Firestore instance.
 * Config comes from the runtime-injected window._env_ (shared with the React app).
 */
function getDb() {
  if (_db) return _db;

  const env = window._env_ || {};
  const config = {
    apiKey:            env.VITE_FIREBASE_API_KEY            || '',
    authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN        || '',
    projectId:         env.VITE_FIREBASE_PROJECT_ID         || '',
    storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             env.VITE_FIREBASE_APP_ID             || '',
  };

  if (!config.projectId || !config.apiKey) {
    console.warn('[firebase-forms] Firebase not configured — form submissions disabled.');
    return null;
  }

  // Use a different app name so it doesn't collide if the React app is also loaded
  const app = firebase.initializeApp(config, 'marketing');
  _db = firebase.firestore(app);
  return _db;
}

/**
 * Subscribe an email to the newsletter.
 * Writes to Firestore collection "newsletterSubscribers".
 */
async function submitNewsletterSubscription(email) {
  const db = getDb();
  if (!db) throw new Error('Firebase not available');

  await db.collection('newsletterSubscribers').add({
    email: email,
    source: 'marketing-footer',
    subscribedAt: firebase.firestore.FieldValue.serverTimestamp(),
    userAgent: navigator.userAgent,
  });
}

/**
 * Submit a Contact Sales inquiry.
 * Writes to Firestore collection "contactSalesInquiries".
 */
async function submitContactSalesInquiry({ name, email, company, message }) {
  const db = getDb();
  if (!db) throw new Error('Firebase not available');

  await db.collection('contactSalesInquiries').add({
    name:    name    || '',
    email:   email   || '',
    company: company || '',
    message: message || '',
    source: 'marketing-pricing',
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    userAgent: navigator.userAgent,
  });
}

// Expose for use by main.js
window._bsForms = {
  submitNewsletterSubscription,
  submitContactSalesInquiry,
};
