import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import vesuRoutes from "../src/routes/vesu.js";

const originalFetch = globalThis.fetch;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/vesu", vesuRoutes);
  return app;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("GET /api/vesu/* forwards query and status/body", async () => {
  let capturedUrl = "";
  let capturedMethod = "";

  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedMethod = String(init?.method ?? "");
    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const res = await request(createApp()).get("/api/vesu/pools?onlyVerified=true");

  assert.equal(res.status, 201);
  assert.equal(capturedMethod, "GET");
  assert.match(capturedUrl, /https:\/\/api\.vesu\.xyz\/pools\?onlyVerified=true/);
  assert.deepEqual(res.body, { ok: true });
});

test("POST /api/vesu/* forwards method and JSON body", async () => {
  let capturedMethod = "";
  let capturedBody = "";

  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    capturedMethod = String(init?.method ?? "");
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ forwarded: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const res = await request(createApp()).post("/api/vesu/positions").send({ hello: "world" });

  assert.equal(res.status, 200);
  assert.equal(capturedMethod, "POST");
  assert.deepEqual(JSON.parse(capturedBody), { hello: "world" });
  assert.deepEqual(res.body, { forwarded: true });
});

test("vesu proxy returns 502 when upstream fetch throws", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  const res = await request(createApp()).get("/api/vesu/pools");

  assert.equal(res.status, 502);
  assert.match(res.body.error, /network down/);
});
