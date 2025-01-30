FROM postgres:15-alpine

# Install Node.js (using apk instead of apt-get)
RUN apk add --no-cache \
    curl \
    bash \
    nodejs \
    npm

# Set the working directory for Node.js scripts
WORKDIR /app

# Copy your Node.js package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your app
COPY . .

# Default behavior remains running Postgres

