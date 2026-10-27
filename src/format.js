import { formatBytes } from "./util.js";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const WHITE = "\x1b[37m";
const BLUE = "\x1b[34m";

export const ALL_SECTIONS = ["host", "os", "cpu", "memory", "disk", "gpu", "display", "battery", "network", "runtime"];

function paint(enabled, code, text) {
  if (!enabled) return text;
  return `${code}${text}${RESET}`;
}

export function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(text) {
  return stripAnsi(text).length;
}

function bar(percentValue, width = 18, colorEnabled = true) {
  const clamped = Math.min(100, Math.max(0, Number(percentValue) || 0));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const tone = clamped >= 90 ? RED : clamped >= 70 ? YELLOW : GREEN;
  const body = `${"█".repeat(filled)}${"░".repeat(empty)}`;
  return `${paint(colorEnabled, tone, body)} ${String(clamped).padStart(3)}%`;
}

function osLabel(os) {
  if (os.caption) return `${os.caption} (${os.arch})`;
  if (os.platform === "win32") return `Windows ${os.release} (${os.arch})`;
  if (os.platform === "darwin") return `macOS ${os.release} (${os.arch})`;
  return `${os.name} ${os.release} (${os.arch})`;
}

const LOGO = [
  "      *",
  "     /|\\",
  "    /_|_\\",
  "     / \\",
  "   astra",
];

function sectionEnabled(wanted, name) {
  return !wanted || wanted.includes(name);
}

function kv(color, label, value) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return [paint(color, CYAN, label.padEnd(12)), String(value)];
}

function coreBars(cpu, color) {
  if (!cpu.perCore?.length) return [];
  const chunk = 4;
  const lines = [];
  for (let i = 0; i < cpu.perCore.length; i += chunk) {
    const slice = cpu.perCore.slice(i, i + chunk);
    const cells = slice.map((c) => `c${c.index}:${String(c.usagePercent).padStart(3)}%`).join("  ");
    lines.push(kv(color, i === 0 ? "Cores" : "", cells));
  }
  return lines.filter(Boolean);
}

export function formatJson(info) {
  return JSON.stringify(info, null, 2);
}

export function formatPretty(info, { color = true, compact = false, logo = true, sections = null } = {}) {
  const wanted = sections && sections.length ? sections : ALL_SECTIONS;
  const blocks = [];

  if (sectionEnabled(wanted, "host")) {
    blocks.push(
      ["Host", [
        kv(color, "Name", info.host.name),
        kv(color, "User", info.host.user),
        kv(color, "Home", compact ? null : info.host.home),
        kv(color, "Shell", info.host.shell),
        kv(color, "Uptime", info.uptime),
      ]],
    );
  }

  if (sectionEnabled(wanted, "os")) {
    blocks.push(
      ["OS", [
        kv(color, "System", osLabel(info.os)),
        kv(color, "Kernel", info.os.kernel),
        kv(color, "Machine", [info.os.manufacturer, info.os.model].filter(Boolean).join(" · ") || null),
        kv(color, "Board", [info.board?.manufacturer, info.board?.product].filter(Boolean).join(" · ") || null),
        kv(color, "BIOS", [info.bios?.vendor, info.bios?.version].filter(Boolean).join(" · ") || null),
        kv(color, "VM/HV", info.os.hypervisor ? "yes" : null),
        kv(color, "Locale", `${info.os.locale} · ${info.os.timeZone}`),
        kv(color, "Boot", info.os.lastBoot),
        kv(color, "Procs", info.os.processes),
      ]],
    );
  }

  if (sectionEnabled(wanted, "cpu")) {
    const cpuBits = [
      info.cpu.model,
      info.cpu.physicalCores ? `${info.cpu.physicalCores}c/${info.cpu.cores}t` : `${info.cpu.cores} cores`,
      info.cpu.speedMhz ? `${info.cpu.speedMhz} MHz` : null,
      info.cpu.usagePercent == null ? null : `${info.cpu.usagePercent}%`,
    ].filter(Boolean);
    blocks.push(
      ["CPU", [
        kv(color, "Model", cpuBits.join("  ·  ")),
        ...(!compact ? coreBars(info.cpu, color) : []),
        kv(color, "Load", info.load ? info.load.join("  ") : null),
      ]],
    );
  }

  if (sectionEnabled(wanted, "memory")) {
    const memRows = [
      kv(color, "RAM", `${info.memory.usedGb} / ${info.memory.totalGb} GB   ${bar(info.memory.usedPercent, 16, color)}`),
    ];
    if (info.memory.swap) {
      memRows.push(
        kv(color, "Swap", `${info.memory.swap.usedGb} / ${info.memory.swap.totalGb} GB   ${bar(info.memory.swap.usedPercent, 16, color)}`),
      );
    }
    if (!compact) {
      info.memory.modules.forEach((m, i) => {
        memRows.push(
          kv(
            color,
            i === 0 ? "DIMM" : "",
            [m.slot, `${m.sizeGb} GB`, m.speedMhz ? `${m.speedMhz} MHz` : null, m.manufacturer]
              .filter(Boolean)
              .join("  ·  "),
          ),
        );
      });
    }
    blocks.push(["Memory", memRows]);
  }

  if (sectionEnabled(wanted, "disk")) {
    const diskRows =
      info.disks.length === 0
        ? [kv(color, "Volume", paint(color, DIM, "unavailable"))]
        : info.disks.map((disk, i) =>
            kv(
              color,
              i === 0 ? "Volume" : "",
              `${disk.mount}${disk.name ? ` (${disk.name})` : ""}${disk.filesystem ? ` ${disk.filesystem}` : ""}  ${disk.usedGb} / ${disk.totalGb} GB   ${bar(disk.usedPercent, 16, color)}`,
            ),
          );
    blocks.push(["Disk", diskRows]);
  }

  if (sectionEnabled(wanted, "gpu") && info.gpu.length) {
    blocks.push([
      "GPU",
      info.gpu.map((g, i) =>
        kv(
          color,
          i === 0 ? "Adapter" : "",
          [g.name, g.vramBytes ? formatBytes(g.vramBytes) : null, g.driver, g.resolution].filter(Boolean).join("  ·  "),
        ),
      ),
    ]);
  }

  if (sectionEnabled(wanted, "display") && info.display.length) {
    blocks.push([
      "Display",
      info.display.map((d, i) => kv(color, i === 0 ? "Screen" : "", `${d.name}  ·  ${d.resolution}`)),
    ]);
  }

  if (sectionEnabled(wanted, "battery") && info.battery.length) {
    blocks.push([
      "Battery",
      info.battery.map((b) =>
        kv(
          color,
          "Status",
          `${b.name}  ${b.percent == null ? "" : bar(b.percent, 16, color)}  ${b.status}${
            b.minutesRemaining ? `  ·  ${b.minutesRemaining} min` : ""
          }`,
        ),
      ),
    ]);
  }

  if (sectionEnabled(wanted, "network")) {
    const netRows = [
      kv(color, "Primary", [info.network.interface, info.network.ipv4, info.network.ipv6].filter(Boolean).join("  ·  ")),
      kv(color, "MAC", compact ? null : info.network.mac),
    ];
    if (!compact) {
      info.network.interfaces.forEach((iface) => {
        const addrs = [...iface.ipv4, ...iface.ipv6.slice(0, 1)].join(", ");
        netRows.push(
          kv(
            color,
            "IF",
            `${iface.name}${iface.internal ? paint(color, DIM, "  loopback") : ""}  ${addrs}${iface.mac ? `  ${iface.mac}` : ""}`,
          ),
        );
      });
    }
    blocks.push(["Network", netRows]);
  }

  if (sectionEnabled(wanted, "runtime")) {
    blocks.push(
      ["Runtime", [
        kv(color, "Node", info.runtime.node),
        kv(color, "npm", info.runtime.npm),
        kv(color, "Git", info.runtime.git),
        kv(color, "When", compact ? null : info.collectedAt),
      ]],
    );
  }

  const rows = [];
  for (const [title, items] of blocks) {
    const filled = items.filter(Boolean);
    if (!filled.length) continue;
    rows.push(["__section__", title]);
    rows.push(...filled);
  }

  let innerWidth = 78;
  for (const row of rows) {
    if (row[0] === "__section__") continue;
    innerWidth = Math.max(innerWidth, visibleLength(`${row[0]}  ${row[1]}`));
  }
  innerWidth = Math.min(innerWidth, 110);
  const title = paint(color, BOLD + MAGENTA, "sysinfo-astra");
  const titlePad = Math.max(1, innerWidth - visibleLength("sysinfo-astra") - 2);
  const top = `┌─ ${title} ${"─".repeat(titlePad)}┐`;
  const bottom = `└${"─".repeat(innerWidth + 2)}┘`;

  const bodyLines = [];
  for (const row of rows) {
    if (row[0] === "__section__") {
      const name = paint(color, BOLD + BLUE, row[1]);
      const used = visibleLength(row[1]) + 1;
      const pad = Math.max(1, innerWidth - used);
      bodyLines.push(`│ ${name} ${paint(color, DIM, "─".repeat(pad))}│`);
      continue;
    }
    const line = `${row[0]}  ${paint(color, WHITE, row[1])}`;
    const pad = Math.max(1, innerWidth - visibleLength(line));
    bodyLines.push(`│ ${line}${" ".repeat(pad)}│`);
  }

  const box = `${top}\n${bodyLines.join("\n")}\n${bottom}`;
  if (!logo) return `\n${box}\n\n`;

  const logoLines = LOGO.map((l) => paint(color, MAGENTA, l.padEnd(12)));
  const boxArr = box.split("\n");
  const merged = [];
  const max = Math.max(logoLines.length, boxArr.length);
  for (let i = 0; i < max; i += 1) {
    const left = logoLines[i] || " ".repeat(12);
    const right = boxArr[i] || "";
    merged.push(`${left}  ${right}`);
  }
  return `\n${merged.join("\n")}\n\n`;
}
