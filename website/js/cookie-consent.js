/* ============================================
   BuildSheet Marketing — Cookie Consent UI
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const CONSENT_KEY = 'bs-cookie-consent';
  let consentValue = localStorage.getItem(CONSENT_KEY);

  // If no consent has been given or rejected, render the banner
  if (!consentValue) {
    renderBanner();
  } else {
    applyConsent(consentValue);
  }

  // Allow "Open Cookie Preferences" button to reset/re-open banner
  const openPrefs = document.getElementById('open-cookie-preferences');
  if (openPrefs) {
    openPrefs.addEventListener('click', (e) => {
      e.preventDefault();
      renderBanner();
    });
  }

  function applyConsent(value) {
    if (value === 'all') {
      console.log('[Privacy] Non-essential cookies accepted. Initializing analytics...');
      initAnalytics();
    } else {
      console.log('[Privacy] Only essential cookies running. Analytics disabled/omitted.');
      // If Firebase was already loaded (e.g., from a previous opt-in), disable it
      if (window.firebase && firebase.analytics) {
        firebase.analytics().setAnalyticsCollectionEnabled(false);
      }
    }
  }

  function initAnalytics() {
    // If we've already initialized, don't do it again
    if (window._jsAnalyticsLoaded) return;
    window._jsAnalyticsLoaded = true;

    // We can confidently load the Google/Firebase Analytics SDK dynamically
    const script = document.createElement('script');
    script.src = "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics-compat.js";
    script.onload = () => {
      const env = window._env_ || {};
      if (env.VITE_FIREBASE_MEASUREMENT_ID && window.firebase && firebase.app) {
        // Find existing marketing app or initialize a generic one
        const apps = firebase.apps;
        const appName = apps.length > 0 ? apps[0].name : '[DEFAULT]';
        let app = apps.find(a => a.name === appName);
        
        if (app && !app.analytics) {
          const analytics = firebase.analytics(app);
          analytics.setAnalyticsCollectionEnabled(true);
          console.log('[Privacy] Analytics collection successfully enabled.');
        }
      }
    };
    document.head.appendChild(script);
  }

  function renderBanner() {
    // Remove if already exists
    const existing = document.getElementById('cookie-consent-banner');
    if (existing) existing.remove();

    const bannerHtml = `
      <div id="cookie-consent-banner" style="position:fixed; bottom:0; left:0; right:0; background:var(--color-bg-secondary, #1E293B); padding:1.5rem; border-top:1px solid var(--color-border, #334155); z-index:9999; display:flex; flex-direction:column; gap:1rem; box-shadow:0 -4px 12px rgba(0,0,0,0.1); font-family:var(--font-sans, Inter, sans-serif);">
        <div style="flex:1;">
          <h4 style="margin:0 0 0.5rem 0; font-size:1rem; color:var(--color-text-primary, #F8FAFC);">We Value Your Privacy</h4>
          <p style="margin:0; font-size:0.875rem; color:var(--color-text-secondary, #94A3B8); line-height:1.5; max-width:800px;">
            We use cookies to enhance your browsing experience, securely authenticate your sessions, and analyze our traffic. 
            By clicking "Accept All", you consent to our use of cookies as described in our <a href="cookie-policy.html" style="color:var(--color-accent-blue, #6366F1);">Cookie Policy</a>.
          </p>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button id="btn-accept-all" style="background:#6366F1; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer;">Accept All</button>
          <button id="btn-reject-all" style="background:transparent; color:var(--color-text-primary, #F8FAFC); border:1px solid var(--color-border, #334155); padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer;">Reject Non-Essential</button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', bannerHtml);

    document.getElementById('btn-accept-all').addEventListener('click', () => {
      localStorage.setItem(CONSENT_KEY, 'all');
      document.getElementById('cookie-consent-banner').remove();
      applyConsent('all');
    });

    document.getElementById('btn-reject-all').addEventListener('click', () => {
      localStorage.setItem(CONSENT_KEY, 'essential');
      document.getElementById('cookie-consent-banner').remove();
      applyConsent('essential');
    });
  }
});
