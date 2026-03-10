# -----------------------------------------------------------------------------
# Stage 1: Build the Vite app with Bun
# -----------------------------------------------------------------------------
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install dependencies (use frozen lockfile for reproducible builds)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source and config
COPY . .

# Build-time env (Vite inlines VITE_* at build time)
# Override these in Coolify build args or leave defaults
ARG VITE_PRIVY_APP_ID=
ARG VITE_API_URL=https://qk0owo0gcg8g0o0sgo4g84ow.thecircleco.xyz
ARG VITE_NETWORK=sepolia
ARG VITE_RPC_URL=
ARG VITE_BITCOIN_NETWORK=
ARG VITE_PRIVY_LOGIN_METHODS=email,google

ENV VITE_PRIVY_APP_ID=${VITE_PRIVY_APP_ID} \
    VITE_API_URL=${VITE_API_URL} \
    VITE_NETWORK=${VITE_NETWORK} \
    VITE_RPC_URL=${VITE_RPC_URL} \
    VITE_BITCOIN_NETWORK=${VITE_BITCOIN_NETWORK} \
    VITE_PRIVY_LOGIN_METHODS=${VITE_PRIVY_LOGIN_METHODS}

RUN bun run build

# -----------------------------------------------------------------------------
# Stage 2: Serve static files with nginx
# -----------------------------------------------------------------------------
FROM nginx:alpine

# Remove default config and use our SPA config
RUN rm -rf /usr/share/nginx/html /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 (Coolify expects this by default)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
