FROM node:22-alpine

WORKDIR /app

# Copiar arquivos da aplicação
COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY style.css ./
COPY script.js ./
COPY vendor ./vendor

# Variáveis de ambiente de produção
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/synchro.db

RUN mkdir -p /app/data

VOLUME ["/app/data"]

EXPOSE 3001

CMD ["node", "--no-warnings", "--experimental-sqlite", "server.js"]
