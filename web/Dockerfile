# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0

FROM node:22.19.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.28.0-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
