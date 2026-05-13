#!/bin/sh

# Create the env-config.js file in the React app webroot.
# AI keys are NO LONGER sent to the browser — they stay server-side only.
# Only Firebase and Stripe config (needed for client-side auth/payments) is exposed.
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
  VITE_STRIPE_PRO_ANNUAL_PRICE_ID: "${VITE_STRIPE_PRO_ANNUAL_PRICE_ID}",
  AI_KEY: "${AI_KEY}"
};
EOF

# Start the Node.js API server in the background.
# AI keys and model config are passed via environment variables (already set by Cloud Run).
cd /app/server && node dist/index.js &

# Start nginx in the foreground.
exec nginx -g 'daemon off;'
