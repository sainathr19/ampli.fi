import test from "node:test";
import assert from "node:assert/strict";
import { buildLoanOffersFromPools, sortLoanOffers } from "../src/lib/offers.js";

const pools = [
  {
    id: "pool-1",
    name: "Prime",
    isDeprecated: false,
    assets: [
      {
        address: "0xbtc",
        symbol: "WBTC",
        decimals: 8,
        usdPrice: { value: "60000000000000000000000", decimals: 18 },
        stats: {
          supplyApy: { value: "30000000000000000", decimals: 18 },
          btcFiSupplyApr: { value: "10000000000000000", decimals: 18 },
        },
      },
      {
        address: "0xusdc",
        symbol: "USDC",
        decimals: 6,
        usdPrice: { value: "1000000000000000000", decimals: 18 },
        stats: {
          borrowApr: { value: "60000000000000000", decimals: 18 },
        },
      },
    ],
    pairs: [
      {
        collateralAssetAddress: "0xbtc",
        debtAssetAddress: "0xusdc",
        maxLTV: { value: "700000000000000000", decimals: 18 },
        liquidationFactor: { value: "900000000000000000", decimals: 18 },
      },
    ],
  },
];

test("buildLoanOffersFromPools computes quote and rates", () => {
  const offers = buildLoanOffersFromPools(pools, {
    collateral: "WBTC",
    borrow: "USDC",
    mode: "borrowToCollateral",
    borrowUsd: 2000,
    targetLtv: 0.5,
  });

  assert.equal(offers.length, 1);
  const offer = offers[0];
  assert.equal(offer.maxLtv, 0.7);
  assert.equal(offer.liquidationFactor, 0.9);
  assert.equal(offer.collateralApr, 0.01);
  assert.equal(offer.borrowApr, 0.06);
  assert.ok(Math.abs(offer.netApy - -0.05) < 1e-9);
  assert.equal(offer.quote.mode, "borrowToCollateral");
  assert.equal(offer.quote.requiredCollateralUsd, 4000);
  assert.equal(offer.quote.requiredCollateralAmount, 4000 / 60000);
  assert.equal(offer.quote.liquidationPrice, 60000 * (0.5 / 0.9));
});

test("buildLoanOffersFromPools matches by address and enforces targetLtv <= maxLtv", () => {
  const offers = buildLoanOffersFromPools(pools, {
    collateral: "0xbtc",
    borrow: "0xusdc",
    mode: "borrowToCollateral",
    targetLtv: 0.8,
  });

  assert.equal(offers.length, 0);
});

test("sortLoanOffers sorts liquidationPrice with nulls last", () => {
  const offers = buildLoanOffersFromPools(pools, {
    collateral: "WBTC",
    borrow: "USDC",
    mode: "borrowToCollateral",
  });
  const withQuote = buildLoanOffersFromPools(pools, {
    collateral: "WBTC",
    borrow: "USDC",
    mode: "borrowToCollateral",
    borrowUsd: 1000,
    targetLtv: 0.5,
  });

  const sorted = sortLoanOffers([offers[0], withQuote[0]], "liquidationPrice", "asc");
  assert.equal(sorted[0].quote.liquidationPrice !== null, true);
  assert.equal(sorted[1].quote.liquidationPrice, null);
});

test("buildLoanOffersFromPools computes reverse quote for collateralToBorrow mode", () => {
  const offers = buildLoanOffersFromPools(pools, {
    collateral: "WBTC",
    borrow: "USDC",
    mode: "collateralToBorrow",
    collateralAmount: 0.1,
    targetLtv: 0.5,
  });

  assert.equal(offers.length, 1);
  const offer = offers[0];
  assert.equal(offer.quote.mode, "collateralToBorrow");
  assert.equal(offer.quote.collateralAmount, 0.1);
  assert.equal(offer.quote.collateralUsd, 6000);
  assert.equal(offer.quote.maxBorrowUsd, 3000);
  assert.equal(offer.quote.maxBorrowAmount, 3000);
  assert.equal(offer.quote.requiredCollateralUsd, null);
  assert.equal(offer.quote.requiredCollateralAmount, null);
  assert.equal(offer.quote.liquidationPrice, 60000 * (0.5 / 0.9));
});
