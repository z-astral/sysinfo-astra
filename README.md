# sysinfo-astra

**Full-system snapshot CLI for the terminal.**

One command prints host, OS, CPU (per-core), RAM + DIMMs, disks, GPU, display, battery, network interfaces, and Node/npm/git.

Zero runtime dependencies. Node.js 18+. Windows, macOS, Linux.

```bash
npx sysinfo-astra
```

## Install

```bash
npm install -g sysinfo-astra
sysinfo-astra
```

Alias: `sysastra`

## Usage

```text
sysinfo-astra
sysinfo-astra --compact
sysinfo-astra --no-logo
sysinfo-astra --no-color
sysinfo-astra -s cpu,memory,disk,gpu
sysinfo-astra --json
sysinfo-astra --watch 3
sysinfo-astra --help
```

### Sections (`-s` / `--section`)

`host`, `os`, `cpu`, `memory`, `disk`, `gpu`, `display`, `battery`, `network`, `runtime`

### JSON

```bash
sysinfo-astra --json
```

Use it from Node as a library too:

```js
import { collect, formatPretty } from "sysinfo-astra";

const info = await collect();
console.log(formatPretty(info, { color: false }));
```

## What it reports

| Block | Contents |
|---|---|
| Host | hostname, user, home, shell, uptime |
| OS | pretty name, kernel, manufacturer/model, board, BIOS, hypervisor, locale, timezone, process count |
| CPU | model, physical/logical cores, clock, total usage, per-core usage, loadavg (Unix) |
| Memory | used/total bar, swap (Linux), DIMM size/speed when WMI provides it |
| Disk | each local volume with filesystem and usage bar |
| GPU / Display | adapters, VRAM (when available), driver, resolution |
| Battery | percent and status (laptops) |
| Network | primary IPv4/IPv6/MAC plus every interface |
| Runtime | Node, npm, git, collection timestamp |

Hardware extras (GPU, board, BIOS, DIMMs, Windows caption) come from OS APIs (CIM on Windows, `lspci` / `system_profiler` / sysfs on Unix). If a probe fails, that block is omitted instead of crashing.

## Local development

```bash
git clone https://github.com/z-astral/sysinfo-astra.git
cd sysinfo-astra
npm test
node bin/cli.js
npm link
```

## Publish to npm

1. `npm login`
2. `npm view sysinfo-astra` (name must be free)
3. `npm publish --dry-run`
4. `npm publish --access public`

## License

MIT
