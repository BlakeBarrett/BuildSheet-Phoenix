# Use Node to build
FROM node:22-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your code
COPY . .

# Build the React app
RUN npm run build

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

# Start nginx via the startup script
CMD ["./env.sh"]