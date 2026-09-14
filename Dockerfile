FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# We need curl for the healthcheck inside the container
RUN apk --no-cache add curl

CMD ["npm", "start"]
