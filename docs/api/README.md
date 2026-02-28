# AmpliFi API Docs

Base URL (local):

- `http://localhost:6969`

## Health

### `GET /`

Returns:

```json
"Online"
```

## Aggregator Endpoints

All aggregator data is protocol-tagged and paginated.

Pagination query params (optional):

- `page`: positive integer, default `1`
- `limit`: positive integer, default `20`, max `100`

Pagination response metadata:

- `total`
- `page`
- `limit`
- `totalPages`
- `hasNextPage`
- `hasPrevPage`

### `GET /api/pools`

Query params:

- `onlyVerified`: `true | false` (optional)
- `onlyEnabledAssets`: `true | false` (optional)
- `page`, `limit` (optional pagination)

Behavior:

- Fetches pools from Vesu
- Filters deprecated pools (`isDeprecated !== true`)
- Returns normalized pools tagged with protocol

Example:

`GET /api/pools?onlyVerified=true&onlyEnabledAssets=true&page=1&limit=10`

Response shape:

```json
{
  "data": [
    {
      "protocol": "vesu",
      "data": {
        "id": "0x...",
        "name": "Prime",
        "protocolVersion": "v2",
        "isDeprecated": false,
        "assets": [],
        "pairs": []
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

### `GET /api/positions`

Query params:

- `walletAddress`: required
- `page`, `limit` (optional pagination)

Behavior:

- Fetches wallet positions from Vesu
- Returns normalized positions tagged with protocol

Example:

`GET /api/positions?walletAddress=0x...&page=1&limit=20`

Response item shape:

```json
{
  "protocol": "vesu",
  "data": {
    "id": "0x...",
    "pool": "0x...",
    "type": "earn",
    "collateral": "1000000000000000000",
    "collateralShares": "990000000000000000",
    "walletAddress": "0x..."
  }
}
```

### `GET /api/users/:address/history`

Path params:

- `address`: required

Query params:

- `page`, `limit` (optional pagination)

Behavior:

- Fetches user history from Vesu
- Returns normalized history entries tagged with protocol

Example:

`GET /api/users/0x.../history?page=1&limit=20`

Response item shape:

```json
{
  "protocol": "vesu",
  "data": {
    "pool": "0x...",
    "txHash": "0x...",
    "timestamp": 0,
    "collateral": "1000000000000000000",
    "type": "deposit"
  }
}
```

### `GET /api/offers/loan`

Returns protocol-tagged, paginated loan offers for a collateral/borrow pair.

Query params:

- `collateral`: required (symbol like `WBTC` or token address)
- `borrow`: required (symbol like `USDC` or token address)
- `mode`: optional, one of `borrowToCollateral | collateralToBorrow` (default: `borrowToCollateral`)
- `borrowUsd`: optional, positive number (used by `borrowToCollateral`)
- `collateralAmount`: optional, positive number (required by `collateralToBorrow`)
- `targetLtv`: optional, number in `(0, 1]`
- `sortBy`: optional, one of `netApy | maxLtv | liquidationPrice` (default: `netApy`)
- `sortOrder`: optional, one of `asc | desc` (default: `desc`)
- `page`, `limit`: optional pagination

Behavior:

- Uses Vesu pools as source data
- Matches pool pairs by collateral/borrow asset
- Computes:
  - `maxLtv` from pair `maxLTV`
  - `liquidationFactor` from pair `liquidationFactor`
  - `borrowApr` from borrow asset stats
  - `collateralApr` from collateral `btcFiSupplyApr` when present, otherwise `supplyApy`
  - `netApy = collateralApr - borrowApr`
- In `borrowToCollateral` mode, if `borrowUsd` and `targetLtv` are provided, computes:
  - `requiredCollateralUsd = borrowUsd / targetLtv`
  - `requiredCollateralAmount = requiredCollateralUsd / collateralPriceUsd`
  - `liquidationPrice = collateralPriceUsd * (targetLtv / liquidationFactor)`
- In `collateralToBorrow` mode (`collateralAmount` required), computes:
  - `effectiveLtv = targetLtv ?? maxLtv`
  - `collateralUsd = collateralAmount * collateralPriceUsd`
  - `maxBorrowUsd = collateralUsd * effectiveLtv`
  - `maxBorrowAmount = maxBorrowUsd / borrowPriceUsd`
  - `liquidationPrice = collateralPriceUsd * (effectiveLtv / liquidationFactor)`
- If quote inputs are missing, quote values are `null`
- If `targetLtv` exceeds a pair's `maxLtv`, that offer is excluded

Example:

`GET /api/offers/loan?collateral=WBTC&borrow=USDC&borrowUsd=2000&targetLtv=0.5&sortBy=netApy&sortOrder=desc&page=1&limit=10`

Reverse mode example:

`GET /api/offers/loan?collateral=WBTC&borrow=USDC&mode=collateralToBorrow&collateralAmount=0.1&targetLtv=0.5&page=1&limit=10`

Response shape:

```json
{
  "data": [
    {
      "protocol": "vesu",
      "data": {
        "offerId": "vesu:0xpool:0xbtc:0xusdc",
        "pool": { "id": "0xpool", "name": "Prime" },
        "collateral": { "symbol": "WBTC", "address": "0xbtc", "decimals": 8 },
        "borrow": { "symbol": "USDC", "address": "0xusdc", "decimals": 6 },
        "chain": "starknet",
        "maxLtv": 0.7,
        "liquidationFactor": 0.9,
        "borrowApr": 0.06,
        "collateralApr": 0.03,
        "netApy": -0.03,
        "quote": {
          "mode": "borrowToCollateral",
          "borrowUsd": 2000,
          "collateralAmount": null,
          "collateralUsd": null,
          "maxBorrowUsd": null,
          "maxBorrowAmount": null,
          "targetLtv": 0.5,
          "requiredCollateralUsd": 4000,
          "requiredCollateralAmount": 0.0666666667,
          "liquidationPrice": 33333.3333333
        }
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

## Earn Endpoints

All earn data is protocol-tagged and paginated. Supports multiprotocol aggregation (e.g. `native_staking`).

Pagination: same as aggregator (`page`, `limit`, `meta`).

### `GET /api/earn/pools`

Query params:

- `protocol`: filter by protocol (optional)
- `validator`: filter by validator staker address (optional)
- `page`, `limit` (optional pagination)

Example:

`GET /api/earn/pools?protocol=native_staking&page=1&limit=10`

Response item shape:

```json
{
  "protocol": "native_staking",
  "data": {
    "id": "0xval:0xpool",
    "poolContract": "0x...",
    "validator": { "name": "Validator", "stakerAddress": "0x..." },
    "token": { "symbol": "STRK", "address": "0x...", "decimals": 18 },
    "delegatedAmount": "1000",
    "commissionPercent": 10
  }
}
```

### `GET /api/earn/positions`

Query params:

- `walletAddress`: required
- `protocol`: filter by protocol (optional)
- `page`, `limit` (optional pagination)

Example:

`GET /api/earn/positions?walletAddress=0x...&page=1&limit=20`

Response item shape:

```json
{
  "protocol": "native_staking",
  "data": {
    "poolContract": "0x...",
    "token": { "symbol": "STRK", "address": "0x...", "decimals": 18 },
    "staked": "100",
    "rewards": "5",
    "total": "105",
    "unpooling": "0",
    "unpoolTime": null,
    "commissionPercent": 10,
    "rewardAddress": "0x...",
    "walletAddress": "0x..."
  }
}
```

### `GET /api/earn/users/:address/history`

Path params:

- `address`: required (Starknet address)

Query params:

- `protocol`: filter by protocol (optional)
- `type`: filter by event type (`stake` | `add` | `claim` | `exit_intent` | `exit`) (optional)
- `page`, `limit` (optional pagination)

Behavior:

- Fetches stake/claim history on-demand from RPC (last 10 pages or 24h blocks)
- Returns entries tagged with protocol

Example:

`GET /api/earn/users/0x.../history?type=stake&page=1&limit=20`

Response item shape:

```json
{
  "protocol": "native_staking",
  "data": {
    "type": "stake",
    "poolContract": "0x...",
    "txHash": "0x...",
    "timestamp": 1700000000,
    "amount": "100",
    "token": { "symbol": "STRK", "address": "0x...", "decimals": 18 },
    "userAddress": "0x..."
  }
}
```

## Vesu Proxy Endpoint

### `ALL /api/vesu/*`

Generic passthrough proxy to `https://api.vesu.xyz/*`.

Examples:

- `GET /api/vesu/pools?onlyVerified=true&onlyEnabledAssets=true`
- `GET /api/vesu/positions?walletAddress=0x...`
- `GET /api/vesu/users/0x.../history`

Behavior:

- Forwards method, query, and request body
- Returns upstream status and body
- Returns `502` on proxy failure

## Bridge Endpoints

All bridge endpoints are under `GET/POST /api/bridge/*` and currently support incoming swaps only (`BTC -> Starknet asset`).

### `POST /api/bridge/orders`

Create a bridge order and an Atomiq quote context.

Request body:

```json
{
  "sourceAsset": "BTC",
  "destinationAsset": "USDC",
  "amount": "10000000",
  "amountType": "exactIn",
  "receiveAddress": "0x0123...starknet",
  "walletAddress": "0xabc..."
}
```

Validation:

- `sourceAsset`: must be `BTC`
- `destinationAsset`: one of `USDC | ETH | STRK | WBTC | USDT | TBTC`
- `amount`: base units as string (e.g. `"10000000"` for 0.1 BTC, 1 BTC = 100_000_000). For `exactIn`: source token base units. For `exactOut`: destination token base units. DB stores base units; only Atomiq SDK receives decimal conversion.
- `amountType`: `exactIn | exactOut`
- `receiveAddress`: validated with `starknet.js` (`validateAndParseAddress`)

Notes:

- `network` is not accepted from request body.
- Active bridge network is server-configured in `api/Settings.toml` via:
  - `network = "mainnet" | "testnet"`
  - `rpc_url = "<starknet-rpc-url>"`

Response:

```json
{
  "data": {
    "orderId": "uuid",
    "status": "CREATED",
    "depositAddress": "bc1...",
    "amountSats": "10000000",
    "quote": {
      "amountIn": "10000000",
      "amountOut": "9990000",
      "depositAddress": "bc1..."
    },
    "expiresAt": "2026-03-01T00:00:00.000Z"
  }
}
```

- `depositAddress`: BTC address to send to. Send exactly `amountSats` satoshis in a single transaction.
- `amountSats`: Amount to send in satoshis.

### `POST /api/bridge/orders/:id/submit`

Submit signed funding payload.

Request body:

```json
{
  "signedPsbtBase64": "cHNidP8B...",
  "sourceTxId": "optional-if-no-psbt"
}
```

Notes:

- At least one of `signedPsbtBase64` or `sourceTxId` is required.
- Quote expiry is checked before submit.

### `GET /api/bridge/orders/:id`

Fetch full order state:

- status lifecycle (`CREATED`, `AWAITING_USER_SIGNATURE`, `SOURCE_SUBMITTED`, `SOURCE_CONFIRMED`, `SETTLED`, `REFUNDED`, etc.)
- `sourceTxId` and `destinationTxId`
- normalized `quote`, `rawState`, and error fields

### `GET /api/bridge/orders?walletAddress=...&page=1&limit=20`

Wallet-based order history (paginated). Address lookup is normalized to lowercase.

### `POST /api/bridge/orders/:id/retry`

Manually trigger reconcile/recovery for an order.

## Bridge Recovery

The backend runs a periodic poller and attempts:

- auto-claim when swap becomes claimable
- auto-refund when swap becomes refundable
- action/event logging in `bridge_actions` and `bridge_events`

## Frontend Flow

1. Create order (`POST /orders`) – response includes `depositAddress` and `amountSats`
2. Send exactly `amountSats` satoshis to `depositAddress` in a single BTC transaction
3. Submit `sourceTxId` after confirmation (`POST /orders/:id/submit`)
4. Poll status (`GET /orders/:id`) or use history (`GET /orders`)

## Wallet Endpoints (write / non-read-only)

### `POST /api/wallet/starknet`

Creates a Starknet wallet via Privy.

### `POST /api/wallet/sign`

Signs a hash with a Privy wallet.

Body:

```json
{
  "walletId": "string",
  "hash": "string"
}
```

## Paymaster Proxy

### `ALL /api/paymaster/*`

Generic passthrough proxy to AVNU paymaster.
