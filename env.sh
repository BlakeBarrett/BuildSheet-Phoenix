#!/bin/sh

# Create the env-config.js file
echo "window._env_ = {" > /app/dist/env-config.js
echo "  API_KEY: \"${API_KEY}\"," >> /app/dist/env-config.js
echo "  GEMINI_API_KEY: \"${GEMINI_API_KEY}\"" >> /app/dist/env-config.js
echo "};" >> /app/dist/env-config.js

# Start the server
exec serve -s dist -l 8080
