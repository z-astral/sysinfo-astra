import { asArray, runCommand } from "./util.js";

const SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Iso($d) { if ($null -eq $d) { return $null }; ([datetime]$d).ToUniversalTime().ToString('o') }
$osRaw = Get-CimInstance Win32_OperatingSystem
$os = [pscustomobject]@{
  Caption = $osRaw.Caption
  Version = $osRaw.Version
  BuildNumber = $osRaw.BuildNumber
  LastBootUpTime = Iso $osRaw.LastBootUpTime
  NumberOfProcesses = $osRaw.NumberOfProcesses
  OSArchitecture = $osRaw.OSArchitecture
}
$cpu = Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, LoadPercentage, Manufacturer
$gpu = Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion, CurrentHorizontalResolution, CurrentVerticalResolution
$board = Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product
$bios = Get-CimInstance Win32_BIOS | Select-Object SMBIOSBIOSVersion, Manufacturer
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, HypervisorPresent
$mem = Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel, Capacity, Speed, Manufacturer, PartNumber, DeviceLocator
$battery = Get-CimInstance Win32_Battery | Select-Object Name, EstimatedChargeRemaining, BatteryStatus, EstimatedRunTime
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object Caption, FreeSpace, Size, FileSystem, VolumeName
[pscustomobject]@{
  OS = $os
  CPU = $cpu
  GPU = $gpu
  Board = $board
  BIOS = $bios
  Computer = $cs
  MemoryModules = $mem
  Battery = $battery
  Disks = $disks
} | ConvertTo-Json -Compress -Depth 6
`;

export async function windowsInventory() {
  const stdout = await runCommand(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT],
    { timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

function diskRows(data) {
  return asArray(data.Disks)
    .filter((row) => row && Number(row.Size) > 0)
    .map((row) => {
      const size = Number(row.Size);
      const free = Number(row.FreeSpace) || 0;
      return {
        mount: String(row.Caption || "").toUpperCase(),
        name: row.VolumeName || null,
        filesystem: row.FileSystem || null,
        totalBytes: size,
        freeBytes: free,
        usedBytes: size - free,
      };
    });
}

const BATTERY_STATUS = {
  1: "discharging",
  2: "on AC",
  3: "fully charged",
  4: "low",
  5: "critical",
  6: "charging",
  7: "charging / high",
  8: "charging / low",
  9: "charging / critical",
  10: "undefined",
  11: "partially charged",
};

function cleanOem(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/to be filled|default string|system product name|system manufacturer|o\.e\.m\./i.test(text)) {
    return null;
  }
  return text;
}

export function normalizeWindows(data) {
  const os = data.OS || {};
  const computer = data.Computer || {};
  const cpu = asArray(data.CPU)[0] || {};
  const board = asArray(data.Board)[0] || {};
  const bios = asArray(data.BIOS)[0] || {};

  const gpus = asArray(data.GPU)
    .filter((g) => g?.Name)
    .map((g) => ({
      name: String(g.Name).trim(),
      vramBytes: Number(g.AdapterRAM) > 0 ? Number(g.AdapterRAM) : null,
      driver: g.DriverVersion || null,
      resolution:
        g.CurrentHorizontalResolution && g.CurrentVerticalResolution
          ? `${g.CurrentHorizontalResolution}x${g.CurrentVerticalResolution}`
          : null,
    }));

  const memoryModules = asArray(data.MemoryModules)
    .filter((m) => Number(m.Capacity) > 0)
    .map((m) => ({
      slot: m.DeviceLocator || m.BankLabel || null,
      sizeBytes: Number(m.Capacity),
      speedMhz: m.Speed ? Number(m.Speed) : null,
      manufacturer: m.Manufacturer ? String(m.Manufacturer).trim() : null,
      part: m.PartNumber ? String(m.PartNumber).trim() : null,
    }));

  const batteries = asArray(data.Battery)
    .filter((b) => b && (b.EstimatedChargeRemaining != null || b.Name))
    .map((b) => ({
      name: b.Name || "Battery",
      percent: b.EstimatedChargeRemaining == null ? null : Number(b.EstimatedChargeRemaining),
      status: BATTERY_STATUS[Number(b.BatteryStatus)] || "unknown",
      minutesRemaining:
        b.EstimatedRunTime && Number(b.EstimatedRunTime) < 71582788
          ? Number(b.EstimatedRunTime)
          : null,
    }));

  return {
    osCaption: os.Caption ? String(os.Caption).trim() : null,
    osVersion: os.Version || null,
    osBuild: os.BuildNumber || null,
    osArch: os.OSArchitecture || null,
    manufacturer: cleanOem(computer.Manufacturer),
    model: cleanOem(computer.Model),
    hypervisor: Boolean(computer.HypervisorPresent),
    processes: os.NumberOfProcesses ? Number(os.NumberOfProcesses) : null,
    lastBoot: os.LastBootUpTime
      ? String(os.LastBootUpTime).replace(/(\.\d{3})\d+Z$/, "$1Z")
      : null,
    board: {
      manufacturer: cleanOem(board.Manufacturer),
      product: cleanOem(board.Product),
    },
    bios: {
      vendor: cleanOem(bios.Manufacturer),
      version: bios.SMBIOSBIOSVersion || null,
    },
    cpuMeta: {
      name: cpu.Name ? String(cpu.Name).replace(/\s+/g, " ").trim() : null,
      physicalCores: cpu.NumberOfCores ? Number(cpu.NumberOfCores) : null,
      logicalCores: cpu.NumberOfLogicalProcessors ? Number(cpu.NumberOfLogicalProcessors) : null,
      maxMhz: cpu.MaxClockSpeed ? Number(cpu.MaxClockSpeed) : null,
      manufacturer: cpu.Manufacturer || null,
    },
    gpus,
    memoryModules,
    batteries,
    disks: diskRows(data),
    displays: gpus.filter((g) => g.resolution).map((g) => ({ name: g.name, resolution: g.resolution })),
  };
}
