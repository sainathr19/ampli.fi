import test from "node:test";
import assert from "node:assert/strict";
import { AtomiqSdkClient } from "../src/lib/bridge/atomiqClient.js";

function u8(value: number): Buffer {
  return Buffer.from([value]);
}

function encodeVarInt(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 252) {
    throw new Error("test varint helper supports only values 0..252");
  }
  return u8(value);
}

function buildUnsignedTxOneInOneOutTaprootScript(): Buffer {
  const version = Buffer.from("02000000", "hex");
  const inputCount = encodeVarInt(1);
  const prevoutHash = Buffer.alloc(32);
  const prevoutIndex = Buffer.from("00000000", "hex");
  const scriptSigLength = encodeVarInt(0);
  const sequence = Buffer.from("ffffffff", "hex");
  const outputCount = encodeVarInt(1);
  const outputValue = Buffer.from("0100000000000000", "hex");
  const taprootScript = Buffer.concat([u8(0x51), u8(0x20), Buffer.alloc(32, 1)]);
  const outputScriptLength = encodeVarInt(taprootScript.length);
  const locktime = Buffer.from("00000000", "hex");
  return Buffer.concat([
    version,
    inputCount,
    prevoutHash,
    prevoutIndex,
    scriptSigLength,
    sequence,
    outputCount,
    outputValue,
    outputScriptLength,
    taprootScript,
    locktime,
  ]);
}

function buildFundedTaprootPsbt(includeTaprootMetadata: boolean): { psbtHex: string; psbtBase64: string } {
  const magic = Buffer.from("70736274ff", "hex");
  const unsignedTx = buildUnsignedTxOneInOneOutTaprootScript();
  const globalUnsignedTx = Buffer.concat([encodeVarInt(1), u8(0x00), encodeVarInt(unsignedTx.length), unsignedTx]);
  const globalMapEnd = u8(0x00);

  const witnessUtxoValue = Buffer.concat([
    Buffer.from("0100000000000000", "hex"),
    encodeVarInt(34),
    Buffer.concat([u8(0x51), u8(0x20), Buffer.alloc(32, 2)]),
  ]);
  const witnessUtxoEntry = Buffer.concat([
    encodeVarInt(1),
    u8(0x01),
    encodeVarInt(witnessUtxoValue.length),
    witnessUtxoValue,
  ]);

  const tapInternalKeyEntry = Buffer.concat([
    encodeVarInt(1),
    u8(0x17),
    encodeVarInt(32),
    Buffer.alloc(32, 3),
  ]);

  const inputMap = Buffer.concat([
    witnessUtxoEntry,
    ...(includeTaprootMetadata ? [tapInternalKeyEntry] : []),
    u8(0x00),
  ]);

  const outputMap = u8(0x00);
  const psbt = Buffer.concat([magic, globalUnsignedTx, globalMapEnd, inputMap, outputMap]);
  return {
    psbtHex: psbt.toString("hex"),
    psbtBase64: psbt.toString("base64"),
  };
}

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
  const fundedPsbt = buildFundedTaprootPsbt(true);
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
            psbtHex: fundedPsbt.psbtHex,
            psbtBase64: fundedPsbt.psbtBase64,
            signInputs: [0],
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
  assert.equal(payment.psbtBase64, fundedPsbt.psbtBase64);
  assert.deepEqual(payment.signInputs, [0]);
});

test("AtomiqSdkClient createIncomingSwap rejects Taproot PSBT without Taproot metadata", async () => {
  const client = new AtomiqSdkClient() as any;
  const fundedPsbt = buildFundedTaprootPsbt(false);
  const mockSwap = {
    getId: () => "swap-3",
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
            psbtHex: fundedPsbt.psbtHex,
            psbtBase64: fundedPsbt.psbtBase64,
            signInputs: [0],
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

  await assert.rejects(
    client.createIncomingSwap({
      network: "testnet",
      destinationAsset: "WBTC",
      amount: "30038",
      amountType: "exactIn",
      receiveAddress: "0x0123456789012345678901234567890123456789012345678901234567890123",
    }),
    /Taproot inputs missing tapInternalKey\/tapBip32Derivation/
  );
});

test("AtomiqSdkClient createIncomingSwap accepts RAW_PSBT without Taproot metadata", async () => {
  const client = new AtomiqSdkClient() as any;
  const rawPsbt = buildFundedTaprootPsbt(false);
  const mockSwap = {
    getId: () => "swap-4",
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
            type: "RAW_PSBT",
            psbtHex: rawPsbt.psbtHex,
            psbtBase64: rawPsbt.psbtBase64,
            in1sequence: 0,
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
  assert.equal(payment.type, "RAW_PSBT");
  assert.equal(payment.psbtBase64, rawPsbt.psbtBase64);
});

test("AtomiqSdkClient createIncomingSwap passes bitcoinWallet to txsExecute when provided", async () => {
  const client = new AtomiqSdkClient() as any;
  const fundedPsbt = buildFundedTaprootPsbt(true);
  let txsExecuteArg: unknown = null;
  const mockSwap = {
    getId: () => "swap-5",
    getState: () => "PR_CREATED",
    getAddress: () => null,
    getTimeoutTime: () => Date.now() + 10_000,
    getInput: () => ({ amount: "0.00030038" }),
    getOutput: () => ({ amount: "0.00029" }),
    txsExecute: async (options?: unknown) => {
      txsExecuteArg = options;
      return [
        {
          name: "Payment",
          chain: "BITCOIN",
          txs: [
            {
              type: "FUNDED_PSBT",
              psbtHex: fundedPsbt.psbtHex,
              psbtBase64: fundedPsbt.psbtBase64,
              signInputs: [0],
            },
          ],
        },
      ];
    },
  };

  client.getSwapper = async () => ({
    swap: async () => mockSwap,
  });
  client.factory = {
    Tokens: { STARKNET: { WBTC: { symbol: "WBTC" } } },
    TokenResolver: { STARKNET: { getToken: () => ({ symbol: "WBTC" }) } },
  };

  await client.createIncomingSwap({
    network: "testnet",
    destinationAsset: "WBTC",
    amount: "30038",
    amountType: "exactIn",
    receiveAddress: "0x0123456789012345678901234567890123456789012345678901234567890123",
    bitcoinPaymentAddress: "tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkf4h3y7t5",
    bitcoinPublicKey: "03a2d8b728935f61d5bcba0cfb09c2c443c483b5c31ebd180e1833f37344bd34ba",
  });

  assert.deepEqual(txsExecuteArg, {
    bitcoinWallet: {
      address: "tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkf4h3y7t5",
      publicKey: "03a2d8b728935f61d5bcba0cfb09c2c443c483b5c31ebd180e1833f37344bd34ba",
    },
  });
});

test("AtomiqSdkClient createIncomingSwap calls txsExecute without bitcoinWallet by default", async () => {
  const client = new AtomiqSdkClient() as any;
  const rawPsbt = buildFundedTaprootPsbt(false);
  let txsExecuteArg: unknown = "unset";
  const mockSwap = {
    getId: () => "swap-6",
    getState: () => "PR_CREATED",
    getAddress: () => null,
    getTimeoutTime: () => Date.now() + 10_000,
    getInput: () => ({ amount: "0.00030038" }),
    getOutput: () => ({ amount: "0.00029" }),
    txsExecute: async (options?: unknown) => {
      txsExecuteArg = options;
      return [
        {
          name: "Payment",
          chain: "BITCOIN",
          txs: [
            {
              type: "RAW_PSBT",
              psbtHex: rawPsbt.psbtHex,
              psbtBase64: rawPsbt.psbtBase64,
              in1sequence: 0,
            },
          ],
        },
      ];
    },
  };

  client.getSwapper = async () => ({
    swap: async () => mockSwap,
  });
  client.factory = {
    Tokens: { STARKNET: { WBTC: { symbol: "WBTC" } } },
    TokenResolver: { STARKNET: { getToken: () => ({ symbol: "WBTC" }) } },
  };

  await client.createIncomingSwap({
    network: "testnet",
    destinationAsset: "WBTC",
    amount: "30038",
    amountType: "exactIn",
    receiveAddress: "0x0123456789012345678901234567890123456789012345678901234567890123",
  });

  assert.equal(txsExecuteArg, undefined);
});

test("AtomiqSdkClient submitPsbt delegates to swap.submitPsbt", async () => {
  const client = new AtomiqSdkClient() as any;
  const rawPsbt = buildFundedTaprootPsbt(false);
  const order = {
    id: "order-1",
    network: "testnet",
    atomiqSwapId: "swap-1",
  };
  let receivedPsbt: string | null = null;
  client.getSwap = async () => ({
    submitPsbt: async (signedPsbt: string) => {
      receivedPsbt = signedPsbt;
      return "btc-tx-id-1";
    },
  });

  const txId = await client.submitPsbt(order, `  ${rawPsbt.psbtBase64} `);

  assert.equal(receivedPsbt, rawPsbt.psbtBase64);
  assert.equal(txId, "btc-tx-id-1");
});

test("AtomiqSdkClient createIncomingSwap falls back to non-wallet txsExecute when wallet funding fails", async () => {
  const client = new AtomiqSdkClient() as any;
  const rawPsbt = buildFundedTaprootPsbt(false);
  let calledWithWallet = false;
  let calledWithoutWallet = false;
  const mockSwap = {
    getId: () => "swap-7",
    getState: () => "PR_CREATED",
    getAddress: () => null,
    getTimeoutTime: () => Date.now() + 10_000,
    getInput: () => ({ amount: "0.00030038" }),
    getOutput: () => ({ amount: "0.00029" }),
    txsExecute: async (options?: unknown) => {
      if (options && typeof options === "object") {
        calledWithWallet = true;
        throw new Error("Not enough balance!");
      }
      calledWithoutWallet = true;
      return [
        {
          name: "Payment",
          chain: "BITCOIN",
          txs: [
            {
              type: "RAW_PSBT",
              psbtHex: rawPsbt.psbtHex,
              psbtBase64: rawPsbt.psbtBase64,
              in1sequence: 0,
            },
          ],
        },
      ];
    },
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
    bitcoinPaymentAddress: "tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkf4h3y7t5",
    bitcoinPublicKey: "03a2d8b728935f61d5bcba0cfb09c2c443c483b5c31ebd180e1833f37344bd34ba",
  });

  const quote = result.quote as Record<string, unknown>;
  const payment = quote.bitcoinPayment as Record<string, unknown>;
  assert.equal(calledWithWallet, true);
  assert.equal(calledWithoutWallet, true);
  assert.equal(payment.type, "RAW_PSBT");
});
