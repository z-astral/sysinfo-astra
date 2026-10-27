import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { bytesToGb, runCommandSafe } from "./util.js";

async function readText(path) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return "";
  }
}

async function linuxOsRelease() {
  const text = await readText("/etc/os-release");
  const map = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    map[line.slice(0, idx)] = line.slice(idx + 1).replace(/^"|"$/g, "");
  }
  return map.PRETTY_NAME || map.NAME || null;
}

async function linuxGpus() {
  const text = await runCommandSafe("lspci", ["-mm"]);
  if (!text) return [];
  return text
    .split("\n")
    .filter((line) => /VGA|3D|Display/.test(line))
    .map((line) => {
      const parts = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
      return { name: parts.slice(1).join(" ").trim() || line, vramBytes: null, driver: null, resolution: null };
    });
}

async function macGpus() {
  const text = await runCommandSafe("system_profiler", ["SPDisplaysDataType"]);
  if (!text) return [];
  const gpus = [];
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const chip = line.match(/^Chipset Model:\s*(.+)$/);
    if (chip) {
      current = { name: chip[1], vramBytes: null, driver: null, resolution: null };
      gpus.push(current);
    }
    const vram = line.match(/^VRAM.*:\s*(\d+)\s*([MG]B)/i);
    if (vram && current) {
      const n = Number(vram[1]);
      current.vramBytes = vram[2].toUpperCase() === "GB" ? n * 1024 ** 3 : n * 1024 ** 2;
    }
    const res = line.match(/^Resolution:\s*(\d+\s*x\s*\d+)/i);
    if (res && current) current.resolution = res[1].replace(/\s+/g, "");
  }
  return gpus;
}

async function linuxBatteries() {
  let entries = [];
  try {
    entries = await readdir("/sys/class/power_supply");
  } catch {
    return [];
  }
  const batteries = [];
  for (const name of entries) {
    if (!name.toUpperCase().startsWith("BAT")) continue;
    const base = `/sys/class/power_supply/${name}`;
    const capacity = await readText(`${base}/capacity`);
    const status = await readText(`${base}/status`);
    batteries.push({
      name,
      percent: capacity ? Number(capacity) : null,
      status: status || "unknown",
      minutesRemaining: null,
    });
  }
  return batteries;
}

async function macBattery() {
  const text = await runCommandSafe("pmset", ["-g", "batt"]);
  if (!text || !/%/.test(text)) return [];
  const percent = Number((text.match(/(\d+)%/) || [])[1]);
  const charging = /charg/i.test(text);
  return [
    {
      name: "Battery",
      percent: Number.isFinite(percent) ? percent : null,
      status: charging ? "charging" : "discharging",
      minutesRemaining: null,
    },
  ];
}

async function unixDisks() {
  const stdout = await runCommandSafe("df", ["-kP"]);
  if (!stdout) return [];
  const disks = [];
  for (const line of stdout.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const filesystem = parts[0];
    const totalKb = Number(parts[1]);
    const usedKb = Number(parts[2]);
    const availKb = Number(parts[3]);
    const mount = parts[parts.length - 1];
    if (!Number.isFinite(totalKb) || totalKb <= 0) continue;
    if (/^(tmpfs|devfs|overlay|squashfs|efivarfs)$/i.test(filesystem)) continue;
    if (/^\/(dev|sys|proc|run|snap)(\/|$)/.test(mount)) continue;
    disks.push({
      mount,
      name: filesystem,
      filesystem: null,
      totalBytes: totalKb * 1024,
      usedBytes: usedKb * 1024,
      freeBytes: availKb * 1024,
    });
  }
  return disks;
}

async function linuxSwap() {
  const meminfo = await readText("/proc/meminfo");
  const total = Number((meminfo.match(/SwapTotal:\s+(\d+)/) || [])[1]);
  const free = Number((meminfo.match(/SwapFree:\s+(\d+)/) || [])[1]);
  if (!total) return null;
  const totalBytes = total * 1024;
  const freeBytes = (free || 0) * 1024;
  return {
    totalBytes,
    freeBytes,
    usedBytes: totalBytes - freeBytes,
    usedPercent: totalBytes ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0,
    totalGb: bytesToGb(totalBytes),
    usedGb: bytesToGb(totalBytes - freeBytes),
  };
}

export async function unixInventory() {
  const platform = process.platform;
  const [osCaption, gpus, batteries, disks, swap] = await Promise.all([
    platform === "darwin"
      ? runCommandSafe("sw_vers", ["-productName"]).then(async (name) => {
          const version = await runCommandSafe("sw_vers", ["-productVersion"]);
          return [name, version].filter(Boolean).join(" ");
        })
      : linuxOsRelease(),
    platform === "darwin" ? macGpus() : linuxGpus(),
    platform === "darwin" ? macBattery() : linuxBatteries(),
    unixDisks(),
    platform === "linux" ? linuxSwap() : Promise.resolve(null),
  ]);

  return {
    osCaption: osCaption || null,
    osVersion: null,
    osBuild: null,
    osArch: null,
    manufacturer: null,
    model: null,
    hypervisor: false,
    processes: null,
    lastBoot: null,
    board: { manufacturer: null, product: null },
    bios: { vendor: null, version: null },
    cpuMeta: {},
    gpus,
    memoryModules: [],
    batteries,
    disks,
    displays: gpus.filter((g) => g.resolution).map((g) => ({ name: g.name, resolution: g.resolution })),
    swap,
  };
}
