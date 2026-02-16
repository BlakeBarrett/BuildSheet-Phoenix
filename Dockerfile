# Use Node to build and serve
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your code
COPY . .

# Build your app (assuming you have a 'build' script in package.json)
RUN npm run build

# Copy and setup proxy server
COPY proxy-server.mjs .
COPY env.sh .
RUN chmod +x env.sh

# Create a startup script that generates env-config and starts the proxy
RUN echo '#!/bin/sh\n\
echo "window._env_ = {" > /app/dist/env-config.js\n\
echo "  API_KEY: \"${API_KEY}\"," >> /app/dist/env-config.js\n\
echo "  GEMINI_API_KEY: \"${GEMINI_API_KEY}\"," >> /app/dist/env-config.js\n\
echo "  AI_PROVIDER: \"${AI_PROVIDER}\"," >> /app/dist/env-config.js\n\
echo "  LOCAL_AI_URL: \"\"," >> /app/dist/env-config.js\n\
echo "  LOCAL_AI_MODEL: \"${LOCAL_AI_MODEL}\"," >> /app/dist/env-config.js\n\
echo "  LOCAL_AI_VISION_MODEL: \"${LOCAL_AI_VISION_MODEL}\"," >> /app/dist/env-config.js\n\
echo "  LOCAL_AI_KEY: \"${LOCAL_AI_KEY}\"" >> /app/dist/env-config.js\n\
echo "};" >> /app/dist/env-config.js\n\
exec node proxy-server.mjs' > start.sh && chmod +x start.sh

# Start the proxy server
CMD ["./start.sh"]