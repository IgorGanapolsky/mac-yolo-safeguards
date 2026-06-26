FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js store.js ./

ENV HOST=0.0.0.0
ENV PORT=8080
ENV HERMES_MOBILE_DB_PATH=/data/hermes-relay.json

EXPOSE 8080

CMD ["node", "server.js"]
