FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN echo "cache-bust-1"
EXPOSE 3001
CMD ["node", "server.js"]
# v2
