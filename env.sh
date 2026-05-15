#!/bin/sh

# Create the env-config.js file in the React app webroot.
# Only Firebase, Stripe, and reCAPTCHA config (needed for client-side auth/payments)
# plus AI_KEY (needed by the client-side HybridAIService for direct AI calls) are exposed.
# Keep sensitive server-only secrets out of this file.
cat <<EOF > /var/www/app/env-config.js
window._env_ = {
  VITE_FIREBASE_API_KEY: "${VITE_FIREBASE_API_KEY}",
  VITE_FIREBASE_AUTH_DOMAIN: "${VITE_FIREBASE_AUTH_DOMAIN}",
  VITE_FIREBASE_PROJECT_ID: "${VITE_FIREBASE_PROJECT_ID}",
  VITE_FIREBASE_STORAGE_BUCKET: "${VITE_FIREBASE_STORAGE_BUCKET}",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "${VITE_FIREBASE_MESSAGING_SENDER_ID}",
  VITE_FIREBASE_APP_ID: "${VITE_FIREBASE_APP_ID}",
  VITE_FIREBASE_MEASUREMENT_ID: "${VITE_FIREBASE_MEASUREMENT_ID}",
  VITE_RECAPTCHA_SITE_KEY: "${VITE_RECAPTCHA_SITE_KEY}",
  VITE_STRIPE_PRO_MONTHLY_PRICE_ID: "${VITE_STRIPE_PRO_MONTHLY_PRICE_ID}",
  VITE_STRIPE_PRO_ANNUAL_PRICE_ID: "${VITE_STRIPE_PRO_ANNUAL_PRICE_ID}"
};
EOF

# Start the Node.js API server in the background.
# Force PORT=8081 here — Cloud Run injects PORT=8080 for nginx (the public port),
# and we must not let that leak into Node or the two processes conflict on 8080.
cd /app/server && PORT=8081 node dist/index.js &

# Start nginx in the foreground.
exec nginx -g 'daemon off;'
