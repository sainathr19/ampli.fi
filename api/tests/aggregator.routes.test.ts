import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import aggregatorRoutes from "../src/routes/aggregator.js";

const originalFetch = globalThis.fetch;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", aggregatorRoutes);
  return app;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("GET /api/pools returns tagged paginated non-deprecated pools", async () => {
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.includes("/pools")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "pool-1",
              name: "Prime",
              protocolVersion: "v2",
              isDeprecated: false,
              assets: [],
              pairs: [],
            },
            {
              id: "pool-2",
              name: "Old",
              protocolVersion: "v1",
              isDeprecated: true,
              assets: [],
              pairs: [],
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;

  const res = await request(createApp()).get("/api/pools?page=1&limit=10");

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].protocol, "vesu");
  assert.equal(res.body.data[0].data.id, "pool-1");
  assert.equal(res.body.meta.total, 1);
  assert.equal(res.body.meta.page, 1);
  assert.equal(res.body.meta.limit, 10);
});

test("GET /api/positions validates required walletAddress", async () => {
  const res = await request(createApp()).get("/api/positions");
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "walletAddress query parameter is required");
});

test("GET /api/positions paginates and tags response", async () => {
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.includes("/positions")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "p1",
              pool: "pool-1",
              type: "earn",
              collateral: "100",
              collateralShares: "90",
            },
            {
              id: "p2",
              pool: "pool-2",
              type: "earn",
              collateral: "200",
              collateralShares: "180",
            },
            {
              id: "p3",
              pool: "pool-3",
              type: "lend",
              collateral: "300",
              collateralShares: "270",
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;

  const res = await request(createApp()).get("/api/positions?walletAddress=0xabc&page=2&limit=2");

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].protocol, "vesu");
  assert.equal(res.body.data[0].data.id, "p3");
  assert.equal(res.body.data[0].data.walletAddress, "0xabc");
  assert.equal(res.body.meta.total, 3);
  assert.equal(res.body.meta.totalPages, 2);
  assert.equal(res.body.meta.hasNextPage, false);
  assert.equal(res.body.meta.hasPrevPage, true);
});

test("GET /api/users/:address/history returns 400 on invalid page", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;

  const res = await request(createApp()).get("/api/users/0xabc/history?page=0");

  assert.equal(res.status, 400);
  assert.match(res.body.error, /page must be a positive integer/);
});

test("GET /api/offers/loan validates required collateral and borrow", async () => {
  const res = await request(createApp()).get("/api/offers/loan");
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "collateral and borrow query parameters are required");
});

test("GET /api/offers/loan returns sorted tagged offers", async () => {
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.includes("/pools")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "pool-a",
              name: "Pool A",
              isDeprecated: false,
              assets: [
                {
                  address: "0xbtc",
                  symbol: "WBTC",
                  decimals: 8,
                  usdPrice: { value: "60000000000000000000000", decimals: 18 },
                  stats: {
                    supplyApy: { value: "30000000000000000", decimals: 18 },
                    borrowApr: { value: "0", decimals: 18 },
                  },
                },
                {
                  address: "0xusd",
                  symbol: "USDC",
                  decimals: 6,
                  usdPrice: { value: "1000000000000000000", decimals: 18 },
                  stats: {
                    supplyApy: { value: "0", decimals: 18 },
                    borrowApr: { value: "70000000000000000", decimals: 18 },
                  },
                },
              ],
              pairs: [
                {
                  collateralAssetAddress: "0xbtc",
                  debtAssetAddress: "0xusd",
                  maxLTV: { value: "700000000000000000", decimals: 18 },
                  liquidationFactor: { value: "900000000000000000", decimals: 18 },
                },
              ],
            },
            {
              id: "pool-b",
              name: "Pool B",
              isDeprecated: false,
              assets: [
                {
                  address: "0xbtc",
                  symbol: "WBTC",
                  decimals: 8,
                  usdPrice: { value: "65000000000000000000000", decimals: 18 },
                  stats: {
                    supplyApy: { value: "50000000000000000", decimals: 18 },
                    borrowApr: { value: "0", decimals: 18 },
                  },
                },
                {
                  address: "0xusd",
                  symbol: "USDC",
                  decimals: 6,
                  usdPrice: { value: "1000000000000000000", decimals: 18 },
                  stats: {
                    supplyApy: { value: "0", decimals: 18 },
                    borrowApr: { value: "30000000000000000", decimals: 18 },
                  },
                },
              ],
              pairs: [
                {
                  collateralAssetAddress: "0xbtc",
                  debtAssetAddress: "0xusd",
                  maxLTV: { value: "800000000000000000", decimals: 18 },
                  liquidationFactor: { value: "900000000000000000", decimals: 18 },
                },
              ],
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;

  const res = await request(createApp()).get(
    "/api/offers/loan?collateral=WBTC&borrow=USDC&sortBy=netApy&sortOrder=desc&page=1&limit=1"
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].protocol, "vesu");
  assert.equal(res.body.data[0].data.pool.id, "pool-b");
  assert.equal(res.body.meta.total, 2);
  assert.equal(res.body.meta.totalPages, 2);
});

test("GET /api/offers/loan excludes offers when targetLtv exceeds pair maxLtv", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: "pool-a",
            name: "Pool A",
            isDeprecated: false,
            assets: [
              {
                address: "0xbtc",
                symbol: "WBTC",
                decimals: 8,
                usdPrice: { value: "60000000000000000000000", decimals: 18 },
                stats: { supplyApy: { value: "30000000000000000", decimals: 18 } },
              },
              {
                address: "0xusd",
                symbol: "USDC",
                decimals: 6,
                usdPrice: { value: "1000000000000000000", decimals: 18 },
                stats: { borrowApr: { value: "30000000000000000", decimals: 18 } },
              },
            ],
            pairs: [
              {
                collateralAssetAddress: "0xbtc",
                debtAssetAddress: "0xusd",
                maxLTV: { value: "600000000000000000", decimals: 18 },
                liquidationFactor: { value: "900000000000000000", decimals: 18 },
              },
            ],
          },
        ],
      }),
      { status: 200 }
    )) as typeof fetch;

  const res = await request(createApp()).get(
    "/api/offers/loan?collateral=WBTC&borrow=USDC&targetLtv=0.8"
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
  assert.equal(res.body.meta.total, 0);
});
