import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHistoryEntry,
  normalizePool,
  normalizePosition,
  parseOptionalBoolean,
  pickArray,
} from "../src/lib/aggregatorUtils.js";

test("parseOptionalBoolean handles true/false only", () => {
  assert.equal(parseOptionalBoolean("true"), true);
  assert.equal(parseOptionalBoolean("false"), false);
  assert.equal(parseOptionalBoolean("TRUE"), undefined);
  assert.equal(parseOptionalBoolean(undefined), undefined);
});

test("pickArray extracts arrays from root or keyed object", () => {
  assert.deepEqual(pickArray([{ a: 1 }, null], ["data"]), [{ a: 1 }]);
  assert.deepEqual(pickArray({ data: [{ b: 2 }] }, ["data"]), [{ b: 2 }]);
  assert.deepEqual(pickArray({ pools: [{ c: 3 }] }, ["data", "pools"]), [{ c: 3 }]);
  assert.deepEqual(pickArray({ data: "nope" }, ["data"]), []);
});

test("normalizePool maps Vesu shape to normalized pool", () => {
  const pool = normalizePool({
    id: "pool-1",
    name: "Prime",
    protocolVersion: "v2",
    isDeprecated: false,
    assets: [{ symbol: "WBTC", address: "0xbtc", decimals: 8 }],
    pairs: [{ collateralAsset: "0xbtc", debtAsset: "0xusdc" }],
  });

  assert.deepEqual(pool, {
    id: "pool-1",
    name: "Prime",
    protocolVersion: "v2",
    isDeprecated: false,
    assets: [{ symbol: "WBTC", address: "0xbtc", decimals: 8 }],
    pairs: [{ collateralAsset: "0xbtc", debtAsset: "0xusdc" }],
  });
});

test("normalizePosition handles nested pool object fallback", () => {
  const position = normalizePosition(
    {
      id: "position-1",
      pool: { id: "pool-1", name: "Prime" },
      type: "earn",
      collateral: { value: "100" },
      collateralShares: { value: "98" },
    },
    "0xwallet"
  );

  assert.equal(position.id, "position-1");
  assert.equal(position.pool, "");
  assert.equal(position.type, "earn");
  assert.equal(position.collateral, "0");
  assert.equal(position.collateralShares, "0");
  assert.equal(position.walletAddress, "0xwallet");
});

test("normalizeHistoryEntry maps tx hash and timestamp", () => {
  const history = normalizeHistoryEntry({
    pool: { id: "pool-1", name: "Prime" },
    txHash: "0xhash",
    timestamp: "2026-02-28T10:38:38.000Z",
    collateral: { value: "20000000000000000000" },
    type: "withdraw",
  });

  assert.equal(history.txHash, "0xhash");
  assert.equal(history.type, "withdraw");
  assert.equal(history.pool, "");
  assert.equal(history.collateral, "0");
  assert.equal(history.timestamp, 0);
});
