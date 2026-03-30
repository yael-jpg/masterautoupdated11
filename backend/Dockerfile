FROM node:20-alpine
RUN apk add --no-cache font-dejavu postgresql-client
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]
