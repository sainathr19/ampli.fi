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
