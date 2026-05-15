# Use Node to build
FROM node:22-slim

# Set working directory
WORKDIR /app

# ── Build the React frontend ─────────────────────────────────────────────────
COPY package*.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-retries=5

COPY . .

RUN npm run build

# ── Build the API server ─────────────────────────────────────────────────────
WORKDIR /app/server
RUN npm ci --no-audit --no-fund --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-retries=5
RUN npm run build

# ── Runtime setup ────────────────────────────────────────────────────────────
WORKDIR /app

# Install nginx
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# Place marketing site and React app into nginx webroot
RUN mkdir -p /var/www/marketing && cp -r website/. /var/www/marketing/
RUN mkdir -p /var/www/app && cp -r dist/. /var/www/app/

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the startup script
COPY env.sh .
RUN chmod +x env.sh

# Expose the port
EXPOSE 8080

# Start nginx + Node server via the startup script
CMD ["./env.sh"]