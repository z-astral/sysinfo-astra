import {
  arch,
  cpus,
  endianness,
  freemem,
  homedir,
  hostname,
  loadavg,
  networkInterfaces,
  platform,
  release,
  tmpdir,
  totalmem,
  type,
  uptime,
  userInfo,
  version as osVersion,
} from "node:os";
import { env } from "node:process";
import { sampleCpu } from "./cpu.js";
import { unixInventory } from "./unix.js";
import { bytesToGb, formatDuration, percent, runCommandSafe } from "./util.js";
import { normalizeWindows, windowsInventory } from "./windows.js";

function userName() {
  try {
    return userInfo().username;
  } catch {
    return env.USERNAME || env.USER || null;
  }
}

function userShell() {
  try {
    return userInfo().shell || env.SHELL || env.ComSpec || null;
  } catch {
    return env.SHELL || env.ComSpec || null;
  }
}

function scoreInterface(iface) {
  if (iface.internal) return -100;
  const name = iface.name.toLowerCase();
  if (/loopback|vmware|virtualbox|vbox|hyper-v|vethernet|bluetooth|local area connection\*/i.test(name)) {
    return -50;
  }
  if (iface.mac && iface.mac.toLowerCase().startsWith("0a:00:27")) return -40;
  if (iface.ipv4.some((ip) => ip.startsWith("192.168.56.") || ip.startsWith("192.168.137."))) return -20;
  if (/wi-?fi|wlan|wireless/.test(name)) return 40;
  if (/ethernet|eth\d|en0|lan/.test(name) && iface.ipv4.length) return 25;
  if (iface.ipv4.length) return 10;
  return 0;
}

function collectNetwork() {
  const nets = networkInterfaces();
  const interfaces = [];
  for (const [name, entries] of Object.entries(nets)) {
    if (!entries) continue;
    const ipv4 = entries.filter((e) => e.family === "IPv4").map((e) => e.address);
    const ipv6 = entries.filter((e) => e.family === "IPv6" && !e.address.startsWith("fe80:")).map((e) => e.address);
    const mac = entries.find((e) => e.mac && e.mac !== "00:00:00:00:00:00")?.mac ?? null;
    const internal = entries.every((e) => e.internal);
    interfaces.push({ name, ipv4, ipv6, mac, internal });
  }
  const ranked = [...interfaces].sort((a, b) => scoreInterface(b) - scoreInterface(a));
  const primary = ranked[0];
  return {
    ipv4: primary?.ipv4[0] ?? null,
    ipv6: primary?.ipv6[0] ?? null,
    mac: primary?.mac ?? null,
    interface: primary?.name ?? null,
    interfaces,
  };
}

function decorateDisks(disks) {
  return disks.map((d) => ({
    ...d,
    usedPercent: percent(d.usedBytes, d.totalBytes),
    totalGb: bytesToGb(d.totalBytes),
    usedGb: bytesToGb(d.usedBytes),
    freeGb: bytesToGb(d.freeBytes),
  }));
}

async function extras() {
  try {
    if (process.platform === "win32") return normalizeWindows(await windowsInventory());
    return await unixInventory();
  } catch {
    return {
      osCaption: null,
      gpus: [],
      memoryModules: [],
      batteries: [],
      disks: [],
      displays: [],
      board: { manufacturer: null, product: null },
      bios: { vendor: null, version: null },
      cpuMeta: {},
      processes: null,
      lastBoot: null,
      manufacturer: null,
      model: null,
      hypervisor: false,
      swap: null,
    };
  }
}

export async function collect() {
  const total = totalmem();
  const free = freemem();
  const used = total - free;
  const cpuList = cpus();

  const [cpu, extra, npmVersion, gitVersion] = await Promise.all([
    sampleCpu(),
    extras(),
    runCommandSafe("npm", ["-v"]),
    runCommandSafe("git", ["--version"]),
  ]);

  const disks = decorateDisks(extra.disks || []);
  const memoryModules = (extra.memoryModules || []).map((m) => ({
    ...m,
    sizeGb: bytesToGb(m.sizeBytes),
  }));

  return {
    collectedAt: new Date().toISOString(),
    host: {
      name: hostname(),
      user: userName(),
      home: homedir(),
      shell: userShell(),
      tmp: tmpdir(),
    },
    os: {
      name: type(),
      caption: extra.osCaption,
      platform: platform(),
      release: release(),
      kernel: platform() === "win32" ? `NT ${release()}` : osVersion(),
      arch: extra.osArch || arch(),
      endianness: endianness(),
      manufacturer: extra.manufacturer || null,
      model: extra.model || null,
      hypervisor: Boolean(extra.hypervisor),
      processes: extra.processes,
      lastBoot: extra.lastBoot,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    cpu: {
      model: extra.cpuMeta?.name || cpu.model || cpuList[0]?.model?.replace(/\s+/g, " ").trim() || "Unknown",
      manufacturer: extra.cpuMeta?.manufacturer || null,
      cores: extra.cpuMeta?.logicalCores || cpu.cores || cpuList.length,
      physicalCores: extra.cpuMeta?.physicalCores || null,
      speedMhz: extra.cpuMeta?.maxMhz || cpu.speedMhz,
      usagePercent: cpu.usagePercent,
      perCore: cpu.perCore,
    },
    memory: {
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      usedPercent: percent(used, total),
      totalGb: bytesToGb(total),
      usedGb: bytesToGb(used),
      freeGb: bytesToGb(free),
      modules: memoryModules,
      swap: extra.swap || null,
    },
    disks,
    gpu: extra.gpus || [],
    display: extra.displays || [],
    battery: extra.batteries || [],
    board: extra.board,
    bios: extra.bios,
    network: collectNetwork(),
    load: process.platform === "win32" ? null : loadavg().map((n) => Math.round(n * 100) / 100),
    uptimeSeconds: uptime(),
    uptime: formatDuration(uptime()),
    runtime: {
      node: process.version,
      npm: npmVersion || null,
      git: gitVersion.replace(/^git version /i, "") || null,
      pid: process.pid,
      execPath: process.execPath,
    },
  };
}
