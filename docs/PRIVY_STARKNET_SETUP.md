# Privy + Starkzap Integration Guide

This document describes how to configure the Privy and Starkzap integration for AmpliFi, including required API keys and backend endpoints.

## Required API Keys

### 1. Privy

Get these from [console.privy.io](https://console.privy.io):

| Key | Where to use | Description |
|-----|--------------|-------------|
| `PRIVY_APP_ID` | UI (`VITE_PRIVY_APP_ID`) + API | Your Privy application ID for the frontend |
| `PRIVY_APP_SECRET` | API only | Server-side secret – never expose to the browser |

### 2. AVNU Paymaster

Get this from [portal.avnu.fi](https://portal.avnu.fi):

| Key | Where to use | Description |
|-----|--------------|-------------|
| `PAYMASTER_API_KEY` | API only | API key for sponsoring gas fees (fund with STRK) |

---

## Backend Endpoints (API)

Your backend must expose these endpoints for Privy + Starkzap to work:

### Base URL

The UI uses `VITE_API_URL` (default: `http://localhost:3000`).

---

### 1. Create Starknet Wallet

**`POST /api/wallet/starknet`**

Creates a Privy-managed Starknet wallet. Called by the frontend when a user connects with Privy and does not yet have a wallet.

**Request:**
- Method: `POST`
- Headers: `Content-Type: application/json`
- Optional: `Authorization: Bearer <privy_access_token>` for user association

**Response (200):**
```json
{
  "wallet": {
    "id": "wallet-id-from-privy",
    "address": "0x...",
    "publicKey": "0x..."
  }
}
```

**Error (500):**
```json
{
  "error": "Error message"
}
```

---

### 2. Sign Hash

**`POST /api/wallet/sign`**

Signs a hash with the Privy wallet. Called by Starkzap SDK when executing transactions.

**Request:**
- Method: `POST`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "walletId": "wallet-id-from-privy",
  "hash": "0x..."
}
```

**Response (200):**
```json
{
  "signature": "0x..."
}
```

**Error (400):**
```json
{
  "error": "walletId and hash are required"
}
```

**Error (500):**
```json
{
  "error": "Error message"
}
```

---

### 3. Paymaster Proxy

**`POST /api/paymaster/*`** (all paths proxied to AVNU)

Proxies paymaster requests to AVNU. The backend adds the `x-paymaster-api-key` header so the API key is never sent to the client.

**Request:** Forwards the client request as-is.

**Response:** Forwards the AVNU response.

---

## Environment Variables

### UI (`ui/.env` or `ui/.env.local`)

```
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_API_URL=http://localhost:3000
VITE_NETWORK=sepolia
VITE_RPC_URL=https://starknet-sepolia.public.blastapi.io/rpc/v0_8
VITE_PRIVY_LOGIN_METHODS=email,google
```

### API (`api/.env`)

```
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret
PAYMASTER_API_KEY=your-avnu-paymaster-api-key
PORT=3000
CLIENT_URL=http://localhost:5173
```

---

## Running Locally

1. **API:** 
   ```bash
   cd api
   cp .env.example .env
   # Fill in PRIVY_APP_ID, PRIVY_APP_SECRET, PAYMASTER_API_KEY
   bun run dev
   ```

2. **UI:**
   ```bash
   cd ui
   cp .env.example .env.local
   # Fill in VITE_PRIVY_APP_ID and VITE_API_URL
   bun run dev
   ```

API runs on `http://localhost:3000`, UI on `http://localhost:5173`.
