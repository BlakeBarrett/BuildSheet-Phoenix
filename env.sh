#!/bin/sh

# Create the env-config.js file
echo "window._env_ = {" > /app/dist/env-config.js
echo "  API_KEY: \"${API_KEY}\"," >> /app/dist/env-config.js
echo "  GEMINI_API_KEY: \"${GEMINI_API_KEY}\"," >> /app/dist/env-config.js
echo "  AI_PROVIDER: \"${AI_PROVIDER}\"," >> /app/dist/env-config.js
echo "  LOCAL_AI_URL: \"${LOCAL_AI_URL}\"," >> /app/dist/env-config.js
echo "  LOCAL_AI_MODEL: \"${LOCAL_AI_MODEL}\"," >> /app/dist/env-config.js
echo "  LOCAL_AI_VISION_MODEL: \"${LOCAL_AI_VISION_MODEL}\"," >> /app/dist/env-config.js
echo "  LOCAL_AI_KEY: \"${LOCAL_AI_KEY}\"" >> /app/dist/env-config.js
echo "};" >> /app/dist/env-config.js

# Start the server
exec serve -s dist -l 8080
