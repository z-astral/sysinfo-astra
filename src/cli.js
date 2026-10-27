import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "./collect.js";
import { ALL_SECTIONS, formatJson, formatPretty } from "./format.js";

const HELP = `sysinfo-astra — system snapshot for the terminal

Usage:
  sysinfo-astra [options]
  sysastra [options]

Options:
  -s, --section <list>   Comma list: ${ALL_SECTIONS.join(",")}
      --json             Machine-readable JSON
      --compact          Shorter pretty output
      --no-logo          Hide the side logo
      --no-color         Disable ANSI colors
      --watch [sec]      Refresh every N seconds (default 2)
  -h, --help             Show this help
  -v, --version          Show version

Examples:
  sysinfo-astra
  sysinfo-astra --compact
  sysinfo-astra -s cpu,memory,disk
  sysinfo-astra --json
  sysinfo-astra --watch 3
  npx sysinfo-astra
`;

export function packageVersion() {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  return pkg.version;
}

export function parseArgs(argv) {
  const flags = new Set();
  const opts = {
    json: false,
    compact: false,
    logo: true,
    color: true,
    watch: null,
    sections: null,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "-v" || arg === "--version") opts.version = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--compact") opts.compact = true;
    else if (arg === "--no-logo") opts.logo = false;
    else if (arg === "--no-color") opts.color = false;
    else if (arg === "--watch") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-") && Number.isFinite(Number(next))) {
        opts.watch = Math.max(1, Number(next));
        i += 1;
      } else {
        opts.watch = 2;
      }
    } else if (arg.startsWith("--watch=")) {
      opts.watch = Math.max(1, Number(arg.slice(8)) || 2);
    } else if (arg === "-s" || arg === "--section" || arg === "--sections") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("missing value for --section");
      }
      opts.sections = next
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      i += 1;
    } else if (arg.startsWith("--section=")) {
      opts.sections = arg
        .slice(10)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else {
      flags.add(arg);
    }
  }

  if (flags.size) {
    throw new Error(`unknown option: ${[...flags].join(", ")}`);
  }

  if (opts.sections) {
    const unknown = opts.sections.filter((s) => !ALL_SECTIONS.includes(s));
    if (unknown.length) {
      throw new Error(`unknown section: ${unknown.join(", ")}. Use ${ALL_SECTIONS.join(", ")}`);
    }
  }

  if (process.env.NO_COLOR) opts.color = false;
  return opts;
}

function render(info, opts) {
  if (opts.json) return `${formatJson(info)}\n`;
  return formatPretty(info, {
    color: opts.color && process.stdout.isTTY,
    compact: opts.compact,
    logo: opts.logo && !opts.compact,
    sections: opts.sections,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(argv) {
  const opts = parseArgs(argv);

  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }
  if (opts.version) {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }

  if (!opts.watch) {
    process.stdout.write(render(await collect(), opts));
    return;
  }

  let stop = false;
  const onSig = () => {
    stop = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  try {
    while (!stop) {
      const info = await collect();
      if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
      process.stdout.write(render(info, opts));
      await sleep(opts.watch * 1000);
    }
  } finally {
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
  }
}
