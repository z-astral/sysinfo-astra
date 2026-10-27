import { cpus } from "node:os";

function timesTotal(t) {
  return t.user + t.nice + t.sys + t.idle + t.irq;
}

function snapshot() {
  return cpus().map((cpu) => ({
    model: cpu.model.replace(/\s+/g, " ").trim(),
    speedMhz: cpu.speed,
    times: { ...cpu.times },
  }));
}

function usageBetween(first, second) {
  return first.map((a, i) => {
    const b = second[i];
    const idle = b.times.idle - a.times.idle;
    const total = timesTotal(b.times) - timesTotal(a.times);
    const used = total <= 0 ? 0 : Math.round((1 - idle / total) * 100);
    return {
      index: i,
      model: b.model,
      speedMhz: b.speedMhz,
      usagePercent: Math.min(100, Math.max(0, used)),
    };
  });
}

export function sampleCpu(ms = 160) {
  const first = snapshot();
  return new Promise((resolve) => {
    setTimeout(() => {
      const cores = usageBetween(first, snapshot());
      const usagePercent = cores.length
        ? Math.round(cores.reduce((sum, c) => sum + c.usagePercent, 0) / cores.length)
        : null;
      resolve({
        model: cores[0]?.model ?? "Unknown",
        cores: cores.length,
        speedMhz: cores[0]?.speedMhz ?? null,
        usagePercent,
        perCore: cores,
      });
    }, ms);
  });
}
