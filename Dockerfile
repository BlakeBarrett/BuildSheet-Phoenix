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

# Install a simple server that handles SPA routing
RUN npm install -g serve

# Start the server on port 8080 (Cloud Run's default)
# The -s flag tells 'serve' to redirect all 404s to index.html (your slugs!)
CMD ["serve", "-s", "dist", "-l", "8080"]