import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../src/cli.js";
import { ALL_SECTIONS, formatJson, formatPretty } from "../src/format.js";

test("parseArgs reads watch, compact, and sections", () => {
  const opts = parseArgs(["--compact", "--watch", "5", "-s", "cpu,memory"]);
  assert.equal(opts.compact, true);
  assert.equal(opts.watch, 5);
  assert.deepEqual(opts.sections, ["cpu", "memory"]);
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
});

test("pretty output includes host section", () => {
  const sample = {
    collectedAt: "2026-01-01T00:00:00.000Z",
    host: { name: "box", user: "ada", home: "/home/ada", shell: "/bin/bash", tmp: "/tmp" },
    os: {
      name: "Linux",
      caption: "Ubuntu 24.04",
      platform: "linux",
      release: "6.8",
      kernel: "#1",
      arch: "x64",
      endianness: "LE",
      manufacturer: null,
      model: null,
      hypervisor: false,
      processes: 200,
      lastBoot: null,
      locale: "en-US",
      timeZone: "UTC",
    },
    cpu: {
      model: "Test CPU",
      manufacturer: null,
      cores: 2,
      physicalCores: 2,
      speedMhz: 2400,
      usagePercent: 10,
      perCore: [
        { index: 0, usagePercent: 8 },
        { index: 1, usagePercent: 12 },
      ],
    },
    memory: {
      totalGb: 8,
      usedGb: 4,
      usedPercent: 50,
      modules: [],
      swap: null,
    },
    disks: [{ mount: "/", name: "root", filesystem: "ext4", usedGb: 20, totalGb: 100, usedPercent: 20 }],
    gpu: [{ name: "GPU", vramBytes: 2 * 1024 ** 3, driver: null, resolution: "1920x1080" }],
    display: [{ name: "GPU", resolution: "1920x1080" }],
    battery: [],
    board: { manufacturer: null, product: null },
    bios: { vendor: null, version: null },
    network: {
      interface: "eth0",
      ipv4: "10.0.0.2",
      ipv6: null,
      mac: "aa:bb:cc:dd:ee:ff",
      interfaces: [{ name: "eth0", ipv4: ["10.0.0.2"], ipv6: [], mac: "aa:bb:cc:dd:ee:ff", internal: false }],
    },
    load: [0.1, 0.2, 0.3],
    uptime: "1h 2m",
    runtime: { node: "v18.0.0", npm: "10.0.0", git: "2.0.0", pid: 1, execPath: "/usr/bin/node" },
  };

  const text = formatPretty(sample, { color: false, logo: false });
  assert.match(text, /sysinfo-astra/);
  assert.match(text, /Test CPU/);
  assert.match(text, /10\.0\.0\.2/);
  assert.equal(ALL_SECTIONS.includes("gpu"), true);
  JSON.parse(formatJson(sample));
});
