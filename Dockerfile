# Single image that builds the web app and serves it from the API (one service to deploy).
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm --prefix server ci && npm --prefix client ci
COPY server server
COPY client client
RUN npm --prefix client run build && npm --prefix server run build && npm --prefix server prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "dist/index.js"]
