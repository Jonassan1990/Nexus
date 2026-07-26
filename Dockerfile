FROM node:22-bookworm-slim AS deps
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Keep npm version aligned with the lockfile generator to avoid `npm ci` drift.
RUN npm install -g npm@11.6.2

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_NEXUS_AUTH_MODE=entra
ARG NEXT_PUBLIC_NEXUS_APP_URL=
ARG NEXT_PUBLIC_NEXUS_TEST_USER_NAME=Signed-in user
ARG NEXT_PUBLIC_NEXUS_TEST_USER_EMAIL=
ARG NEXT_PUBLIC_COGNITO_DOMAIN=
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID=
ARG NEXT_PUBLIC_COGNITO_USER_POOL_ID=
ARG NEXT_PUBLIC_COGNITO_REGION=eu-north-1
ARG NEXT_PUBLIC_COGNITO_IDP_NAME=EntraID

ENV NEXT_PUBLIC_NEXUS_AUTH_MODE=${NEXT_PUBLIC_NEXUS_AUTH_MODE}
ENV NEXT_PUBLIC_NEXUS_APP_URL=${NEXT_PUBLIC_NEXUS_APP_URL}
ENV NEXT_PUBLIC_NEXUS_TEST_USER_NAME=${NEXT_PUBLIC_NEXUS_TEST_USER_NAME}
ENV NEXT_PUBLIC_NEXUS_TEST_USER_EMAIL=${NEXT_PUBLIC_NEXUS_TEST_USER_EMAIL}
ENV NEXT_PUBLIC_COGNITO_DOMAIN=${NEXT_PUBLIC_COGNITO_DOMAIN}
ENV NEXT_PUBLIC_COGNITO_CLIENT_ID=${NEXT_PUBLIC_COGNITO_CLIENT_ID}
ENV NEXT_PUBLIC_COGNITO_USER_POOL_ID=${NEXT_PUBLIC_COGNITO_USER_POOL_ID}
ENV NEXT_PUBLIC_COGNITO_REGION=${NEXT_PUBLIC_COGNITO_REGION}
ENV NEXT_PUBLIC_COGNITO_IDP_NAME=${NEXT_PUBLIC_COGNITO_IDP_NAME}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN npm install -g npm@11.6.2

RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 appuser

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./next.config.ts

USER appuser

EXPOSE 3000

CMD ["node", "./node_modules/next/dist/bin/next", "start", "-p", "3000"]
