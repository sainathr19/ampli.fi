import test from "node:test";
import assert from "node:assert/strict";
import { getPools, getPositions, getUserHistory } from "../src/lib/vesu.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("getPools forwards query params and parses response", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ data: [{ id: "pool-1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await getPools({ onlyVerified: true, onlyEnabledAssets: true });

  assert.deepEqual(result, { data: [{ id: "pool-1" }] });
  assert.equal(
    requestedUrl,
    "https://api.vesu.xyz/pools?onlyVerified=true&onlyEnabledAssets=true"
  );
});

test("getPositions uses walletAddress query parameter", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;

  await getPositions("0xabc");

  assert.equal(requestedUrl, "https://api.vesu.xyz/positions?walletAddress=0xabc");
});

test("getUserHistory encodes address in path", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;

  await getUserHistory("0xabc/def");

  assert.equal(requestedUrl, "https://api.vesu.xyz/users/0xabc%2Fdef/history");
});

test("vesu client throws with upstream status and body", async () => {
  globalThis.fetch = (async () =>
    new Response("upstream error", {
      status: 500,
      statusText: "Internal Server Error",
    })) as typeof fetch;

  await assert.rejects(
    () => getPools(),
    (error: unknown) =>
      error instanceof Error && error.message.includes("Vesu request failed (500): upstream error")
  );
});
