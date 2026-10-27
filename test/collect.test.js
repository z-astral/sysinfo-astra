import assert from "node:assert/strict";
import { test } from "node:test";
import { collect } from "../src/collect.js";

test("collect returns a full snapshot", async () => {
  const info = await collect();
  assert.equal(typeof info.host.name, "string");
  assert.ok(info.host.name.length > 0);
  assert.equal(typeof info.cpu.cores, "number");
  assert.ok(info.cpu.cores >= 1);
  assert.equal(typeof info.memory.totalBytes, "number");
  assert.ok(info.memory.totalBytes > 0);
  assert.ok(Array.isArray(info.disks));
  assert.ok(Array.isArray(info.network.interfaces));
  assert.match(info.runtime.node, /^v\d+/);
  assert.match(info.collectedAt, /^\d{4}-/);
});
