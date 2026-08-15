import { readFile } from "node:fs/promises";
import type { GameDefinition, SwitchConfig } from "./types.js";

const PLACEHOLDER = /^\$\{([A-Z][A-Z0-9_]*)\}$/;

export async function loadConfig(path: string): Promise<SwitchConfig> {
  const raw = JSON.parse(await readFile(path, "utf8")) as SwitchConfig;
  raw.settings.dockerNetwork = process.env.RYDBERG_NETWORK ?? raw.settings.dockerNetwork;
  raw.settings.publicHost = process.env.GAME_PUBLIC_HOST ?? raw.settings.publicHost;
  validateConfig(raw);
  return raw;
}

export function resolveValue(value: string, env = process.env): string {
  const match = value.match(PLACEHOLDER);
  if (!match) return value;
  return env[match[1]!] ?? "";
}

export function resolvedEnvironment(game: GameDefinition): string[] {
  return Object.entries(game.environment).map(
    ([key, value]) => `${key}=${resolveValue(value)}`,
  );
}

export function missingEnvironment(game: GameDefinition): string[] {
  return (game.requiredEnvironment ?? []).filter((key) => !process.env[key]?.trim());
}

function validateConfig(config: SwitchConfig): void {
  if (config.version !== 1) throw new Error(`Unsupported games config version: ${config.version}`);
  if (!config.settings || !Array.isArray(config.games)) throw new Error("Invalid games config");
  if (config.settings.maxConcurrent !== 1) {
    throw new Error("Switch currently requires maxConcurrent to be exactly 1");
  }

  const ids = new Set<string>();
  for (const game of config.games) {
    if (!/^[a-z0-9-]+$/.test(game.id)) throw new Error(`Invalid game id: ${game.id}`);
    if (ids.has(game.id)) throw new Error(`Duplicate game id: ${game.id}`);
    ids.add(game.id);
    if (game.memoryMb > config.settings.budgetMemoryMb) {
      throw new Error(`${game.name} exceeds the configured memory budget`);
    }
    if (game.memoryMb < 512 || game.cpus <= 0) throw new Error(`Invalid resources for ${game.name}`);
    const ports = new Set<string>();
    for (const port of game.ports) {
      if (port.container < 1 || port.host < 1 || port.host > 65535) {
        throw new Error(`Invalid port for ${game.name}`);
      }
      const key = `${port.host}/${port.protocol}`;
      if (port.public && ports.has(key)) throw new Error(`Duplicate public port ${key} in ${game.name}`);
      ports.add(key);
    }
  }
}
