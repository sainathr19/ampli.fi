import test from "node:test";
import assert from "node:assert/strict";
import { AtomiqSdkClient } from "../src/lib/bridge/atomiqClient.js";

test("AtomiqSdkClient createIncomingSwap falls back to swap.getAddress", async () => {
  const client = new AtomiqSdkClient() as any;
  const mockSwap = {
    getId: () => "swap-1",
    getState: () => "PR_CREATED",
    getAddress: () => "tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkf4h3y7t5",
    getTimeoutTime: () => Date.now() + 10_000,
    getInput: () => ({ amount: "0.00030038" }),
    getOutput: () => ({ amount: "0.00028" }),
    txsExecute: async () => [],
  };

  client.getSwapper = async () => ({
    swap: async () => mockSwap,
  });
  client.factory = {
    Tokens: { STARKNET: { WBTC: { symbol: "WBTC" } } },
    TokenResolver: { STARKNET: { getToken: () => ({ symbol: "WBTC" }) } },
  };

  const result = await client.createIncomingSwap({
    network: "testnet",
    destinationAsset: "WBTC",
    amount: "30038",
    amountType: "exactIn",
    receiveAddress: "0x0123456789012345678901234567890123456789012345678901234567890123",
  });

  assert.equal(result.depositAddress, "tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkf4h3y7t5");
  assert.equal((result.quote as Record<string, unknown>).depositAddress, "tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkf4h3y7t5");
  assert.equal(result.amountSource, "30038");
});

test("AtomiqSdkClient createIncomingSwap returns FUNDED_PSBT payment details", async () => {
  const client = new AtomiqSdkClient() as any;
  const mockSwap = {
    getId: () => "swap-2",
    getState: () => "PR_CREATED",
    getAddress: () => null,
    getTimeoutTime: () => Date.now() + 10_000,
    getInput: () => ({ amount: "0.00030038" }),
    getOutput: () => ({ amount: "0.00029" }),
    txsExecute: async () => [
      {
        name: "Payment",
        chain: "BITCOIN",
        txs: [
          {
            type: "FUNDED_PSBT",
            psbtHex: "70736274ff01",
            psbtBase64: "cHNidP8BAA==",
            signInputs: [1, 2],
          },
        ],
      },
    ],
  };

  client.getSwapper = async () => ({
    swap: async () => mockSwap,
  });
  client.factory = {
    Tokens: { STARKNET: { WBTC: { symbol: "WBTC" } } },
    TokenResolver: { STARKNET: { getToken: () => ({ symbol: "WBTC" }) } },
  };

  const result = await client.createIncomingSwap({
    network: "testnet",
    destinationAsset: "WBTC",
    amount: "30038",
    amountType: "exactIn",
    receiveAddress: "0x0123456789012345678901234567890123456789012345678901234567890123",
  });

  const quote = result.quote as Record<string, unknown>;
  const payment = quote.bitcoinPayment as Record<string, unknown>;
  assert.equal(result.depositAddress, null);
  assert.equal(payment.type, "FUNDED_PSBT");
  assert.equal(payment.psbtBase64, "cHNidP8BAA==");
  assert.deepEqual(payment.signInputs, [1, 2]);
});
