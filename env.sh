#!/bin/sh

# Create the env-config.js file in the React app webroot
echo "window._env_ = {" > /var/www/app/env-config.js
echo "  API_KEY: \"${API_KEY}\"," >> /var/www/app/env-config.js
echo "  GEMINI_API_KEY: \"${GEMINI_API_KEY}\"" >> /var/www/app/env-config.js
echo "};" >> /var/www/app/env-config.js

# Start nginx
exec nginx -g 'daemon off;'
