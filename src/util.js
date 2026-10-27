import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function bytesToGb(bytes) {
  return Math.round((Number(bytes) / 1024 ** 3) * 10) / 10;
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!days && secs) parts.push(`${secs}s`);
  if (parts.length === 0) parts.push("0m");
  return parts.join(" ");
}

export function percent(used, total) {
  if (!total) return 0;
  return Math.round((used / total) * 100);
}

export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export async function runCommand(file, args, { timeout = 8000, maxBuffer = 1024 * 1024 } = {}) {
  const { stdout } = await execFileAsync(file, args, {
    windowsHide: true,
    timeout,
    maxBuffer,
    encoding: "utf8",
  });
  return String(stdout ?? "").trim();
}

export async function runCommandSafe(file, args, options) {
  try {
    return await runCommand(file, args, options);
  } catch {
    return "";
  }
}

export function parseCsvTable(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i];
    });
    return row;
  });
}
