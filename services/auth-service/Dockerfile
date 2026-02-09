FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3007

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3007/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["npm", "start"]
