FROM node:18-slim

# Instalar dependencias del sistema para Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libwayland-egl1 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    wget \
    --no-install-recommends

WORKDIR /app

# Copiamos solo package.json y package-lock.json primero
COPY package*.json ./

# Ahora sí instalamos dependencias
RUN npm install

# Ahora copiamos el resto del proyecto
COPY . .

# Crear usuario pptruser (esto lo tenías bien)
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
 && mkdir -p /home/pptruser/Downloads \
 && chown -R pptruser:pptruser /home/pptruser \
 && chown -R pptruser:pptruser /app

USER pptruser

CMD ["npm", "start"]
