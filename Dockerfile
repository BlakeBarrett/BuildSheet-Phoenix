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

# Copy the startup script
COPY env.sh .
RUN chmod +x env.sh

# Start the server using the startup script
CMD ["./env.sh"]