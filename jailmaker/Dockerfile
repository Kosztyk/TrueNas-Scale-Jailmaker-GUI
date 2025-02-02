# Use an official Node.js image
FROM node:23-alpine

# Create app directory
WORKDIR /app

# Install build tools (like make, g++), plus python3
#RUN apk add --no-cache python3 make g++

# Copy package definitions
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of the code into the container
COPY . .

# Expose port 8080 in container
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]

