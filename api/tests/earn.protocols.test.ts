import test from "node:test";
import assert from "node:assert/strict";
import { getEnabledEarnProtocols, getEarnProtocolAdapters } from "../src/lib/earn/protocols.js";

test("getEnabledEarnProtocols returns array of protocol names", () => {
  const protocols = getEnabledEarnProtocols();
  assert.equal(Array.isArray(protocols), true);
  assert.ok(protocols.length >= 1);
  protocols.forEach((p) => {
    assert.equal(typeof p, "string");
    assert.ok(p.length > 0);
  });
});

test("getEarnProtocolAdapters returns adapters for enabled protocols", () => {
  const adapters = getEarnProtocolAdapters();
  assert.equal(Array.isArray(adapters), true);
  adapters.forEach((adapter) => {
    assert.equal(typeof adapter.protocol, "string");
    assert.equal(typeof adapter.getPositions, "function");
    assert.ok(adapter.getPools === undefined || typeof adapter.getPools === "function");
    assert.ok(adapter.getHistory === undefined || typeof adapter.getHistory === "function");
  });
});

test("getEarnProtocolAdapters returns native_staking when enabled", () => {
  const adapters = getEarnProtocolAdapters();
  const nativeStaking = adapters.find((a) => a.protocol === "native_staking");
  assert.ok(nativeStaking, "native_staking adapter should be present when enabled");
  assert.equal(typeof nativeStaking.getPools, "function");
  assert.equal(typeof nativeStaking.getPositions, "function");
  assert.equal(typeof nativeStaking.getHistory, "function");
});
