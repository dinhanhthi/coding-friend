FROM node:20-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy CLI source and build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Link globally so `cf` is available
RUN npm link

# Create a test project directory
RUN mkdir -p /test-project && cd /test-project && git init

WORKDIR /test-project
