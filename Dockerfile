FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY controller/package.json controller/package.json
COPY web/package.json web/package.json
RUN npm ci --include=dev

COPY controller controller
COPY web web
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/controller/package.json ./controller/package.json
COPY --from=build /app/controller/dist ./controller/dist
COPY --from=build /app/web/dist ./public
COPY games ./games

EXPOSE 8080
CMD ["node", "controller/dist/index.js"]
