FROM node:20-bullseye-slim AS builder

# Set working directory
WORKDIR /app

# Install runtime dependencies for Puppeteer (headless Chrome)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates fonts-liberation libasound2 libatk1.0-0 libc6 libcairo2 libdbus-1-3 libexpat1 \
       libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libstdc++6 \
       libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxrender1 libxss1 libxtst6 wget \
    && rm -rf /var/lib/apt/lists/*

# Install build dependencies for native modules (if any)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 build-essential \
    # Puppeteer dependencies for headless Chrome
    ca-certificates fonts-liberation libasound2 libatk1.0-0 libc6 libcairo2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
    libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxrender1 libxss1 libxtst6 wget \
    && rm -rf /var/lib/apt/lists/*

# Ensure Puppeteer does not download its own Chromium (we'll use system Chromium in Docker)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install JS dependencies (omit dev dependencies for a lean build)
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

FROM node:20-bullseye-slim AS runner

WORKDIR /app

# Install runtime dependencies, including system Chromium for Puppeteer
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates fonts-liberation libasound2 libatk1.0-0 libcairo2 libdbus-1-3 libexpat1 \
       libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
       libnss3 libpango-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 \
       libxext6 libxfixes3 libxrandr2 libxrender1 libxss1 libxtst6 wget chromium \
    && rm -rf /var/lib/apt/lists/*

# When running inside Docker, disable Chrome sandbox (required in many container environments)
ENV CHROME_DISABLE_SANDBOX=true
# Use system Chromium for Puppeteer (skip bundled download in builder stage)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy application and dependencies from build stage
COPY --from=builder /app /app

# Default command: run the cron-based daemon
CMD ["npm", "run", "daemon"]