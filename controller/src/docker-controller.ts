import { createHash } from "node:crypto";
import Docker from "dockerode";
import { GameDig } from "gamedig";
import { missingEnvironment, resolvedEnvironment, resolveValue } from "./config.js";
import type { GameDefinition, GameView, RuntimeState, SwitchConfig } from "./types.js";

const MANAGED_LABEL = "app.rydberg.switch.managed";
const GAME_LABEL = "app.rydberg.switch.game";
const CONFIG_LABEL = "app.rydberg.switch.config-hash";

function initialState(): RuntimeState {
  return { phase: "stopped", progress: 0, detail: "Ready when you are" };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function decodeDockerLogs(buffer: Buffer): string {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length && (buffer[offset] === 1 || buffer[offset] === 2)) {
    const length = buffer.readUInt32BE(offset + 4);
    if (offset + 8 + length > buffer.length) break;
    chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : buffer.toString("utf8");
}

export class SwitchController {
  private readonly docker = new Docker({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" });
  private readonly states = new Map<string, RuntimeState>();
  private busy = false;
  private poller?: NodeJS.Timeout;

  constructor(private readonly config: SwitchConfig) {
    for (const game of config.games) this.states.set(game.id, initialState());
  }

  async initialize(): Promise<void> {
    await this.docker.ping();
    await this.refresh();
    const seconds = Math.max(5, this.config.settings.autoStop.pollSeconds);
    this.poller = setInterval(() => void this.refresh(), seconds * 1000);
    this.poller.unref();
  }

  views(): GameView[] {
    return this.config.games.map((game) => {
      const state = this.states.get(game.id) ?? initialState();
      const publicPorts = game.ports.filter((port) => port.public);
      const connection = publicPorts[0]
        ? `${this.config.settings.publicHost}:${publicPorts[0].host}`
        : this.config.settings.publicHost;
      return {
        ...state,
        id: game.id,
        name: game.name,
        edition: game.edition,
        description: game.description,
        color: game.color,
        memoryMb: game.memoryMb,
        cpus: game.cpus,
        enabled: game.enabled !== false,
        warning: game.warning,
        imageUrl: game.imageUrl,
        connection,
        ports: game.ports
          .filter((port) => port.public)
          .map((port) => ({ ...port, connection: `${this.config.settings.publicHost}:${port.host}` })),
      };
    });
  }

  settings() {
    return {
      budgetMemoryMb: this.config.settings.budgetMemoryMb,
      maxConcurrent: this.config.settings.maxConcurrent,
      publicHost: this.config.settings.publicHost,
      autoStop: this.config.settings.autoStop,
    };
  }

  async start(gameId: string): Promise<void> {
    if (this.busy) throw new Error("Another server operation is already in progress");
    const game = this.game(gameId);
    if (game.enabled === false) throw new Error(`${game.name} is disabled`);
    const missing = missingEnvironment(game);
    if (missing.length) throw new Error(`Server owner must configure: ${missing.join(", ")}`);
    if (game.memoryMb > this.config.settings.budgetMemoryMb) throw new Error("This server exceeds the memory budget");

    this.busy = true;
    try {
      const own = await this.findContainer(game.id);
      if (own && own.State === "running") return;

      for (const other of this.config.games.filter((candidate) => candidate.id !== game.id)) {
        const container = await this.findContainer(other.id);
        if (container?.State === "running") await this.stopInternal(other);
      }

      this.set(game.id, { phase: "pulling", progress: 5, detail: "Checking game files…" });
      await this.ensureImage(game);
      this.set(game.id, { phase: "creating", progress: 48, detail: "Preparing your saved world…" });
      const container = await this.ensureContainer(game);
      this.set(game.id, { phase: "starting", progress: 60, detail: "Starting the dedicated server…" });
      await container.start();
      const startedAt = new Date().toISOString();
      this.states.set(game.id, {
        phase: "starting",
        progress: 65,
        detail: "The server is warming up…",
        startedAt,
        hadPlayers: false,
      });
    } catch (error) {
      this.set(game.id, { phase: "error", progress: 0, detail: "Could not start", error: message(error) });
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async stop(gameId: string): Promise<void> {
    if (this.busy) throw new Error("Another server operation is already in progress");
    this.busy = true;
    try {
      await this.stopInternal(this.game(gameId));
    } finally {
      this.busy = false;
    }
  }

  async logs(gameId: string): Promise<string[]> {
    const game = this.game(gameId);
    const summary = await this.findContainer(game.id);
    if (!summary) return [];
    const output = (await this.docker.getContainer(summary.Id).logs({
      stdout: true,
      stderr: true,
      tail: 160,
      timestamps: false,
    })) as Buffer;
    return decodeDockerLogs(output).split(/\r?\n/).filter(Boolean).slice(-160);
  }

  private game(id: string): GameDefinition {
    const game = this.config.games.find((candidate) => candidate.id === id);
    if (!game) throw new Error("Unknown game server");
    return game;
  }

  private set(id: string, patch: Partial<RuntimeState>): void {
    this.states.set(id, { ...(this.states.get(id) ?? initialState()), ...patch });
  }

  private async findContainer(gameId: string): Promise<Docker.ContainerInfo | undefined> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: [`${MANAGED_LABEL}=true`, `${GAME_LABEL}=${gameId}`] },
    });
    return containers[0];
  }

  private async ensureImage(game: GameDefinition): Promise<void> {
    try {
      await this.docker.getImage(game.image).inspect();
      this.set(game.id, { progress: 42, detail: "Game files are ready" });
      return;
    } catch {
      // Pull below.
    }

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(game.image, (pullError: Error | null, stream: NodeJS.ReadableStream | undefined) => {
        if (pullError || !stream) {
          reject(pullError ?? new Error("Image download did not start"));
          return;
        }
        this.docker.modem.followProgress(
          stream,
          (progressError) => progressError ? reject(progressError) : resolve(),
          (event: { status?: string }) => {
            const last = event.status;
            this.set(game.id, { progress: 22, detail: last ? `Downloading: ${last}` : "Downloading game files…" });
          },
        );
      });
    });
    this.set(game.id, { progress: 44, detail: "Download complete" });
  }

  private configHash(game: GameDefinition): string {
    return createHash("sha256")
      .update(JSON.stringify({ ...game, environment: resolvedEnvironment(game) }))
      .digest("hex")
      .slice(0, 16);
  }

  private async ensureContainer(game: GameDefinition): Promise<Docker.Container> {
    const existing = await this.findContainer(game.id);
    const hash = this.configHash(game);
    if (existing && existing.Labels[CONFIG_LABEL] === hash) return this.docker.getContainer(existing.Id);
    if (existing) await this.docker.getContainer(existing.Id).remove({ force: true });

    const exposedPorts: Record<string, Record<string, never>> = {};
    const portBindings: Record<string, Array<{ HostIp: string; HostPort: string }>> = {};
    for (const port of game.ports) {
      const key = `${port.container}/${port.protocol}`;
      exposedPorts[key] = {};
      if (port.public) {
        portBindings[key] = [{ HostIp: process.env.GAME_BIND_IP ?? "0.0.0.0", HostPort: String(port.host) }];
      }
    }

    return this.docker.createContainer({
      name: `rydberg-game-${game.id}`,
      Image: game.image,
      Env: resolvedEnvironment(game),
      Labels: { [MANAGED_LABEL]: "true", [GAME_LABEL]: game.id, [CONFIG_LABEL]: hash },
      ExposedPorts: exposedPorts,
      StopTimeout: game.stopSeconds ?? 90,
      HostConfig: {
        Memory: game.memoryMb * 1024 * 1024,
        MemorySwap: game.memoryMb * 1024 * 1024,
        NanoCpus: Math.floor(game.cpus * 1_000_000_000),
        PortBindings: portBindings,
        Mounts: [{ Type: "volume", Source: game.volume.source, Target: game.volume.target }],
        RestartPolicy: { Name: "no" },
        SecurityOpt: ["no-new-privileges:true"],
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [this.config.settings.dockerNetwork]: { Aliases: [`game-${game.id}`] },
        },
      },
    });
  }

  private async stopInternal(game: GameDefinition): Promise<void> {
    const summary = await this.findContainer(game.id);
    if (!summary || summary.State !== "running") {
      this.states.set(game.id, initialState());
      return;
    }
    this.set(game.id, { phase: "stopping", progress: 40, detail: "Saving the world safely…" });
    try {
      await this.docker.getContainer(summary.Id).stop({ t: game.stopSeconds ?? 90 });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("304")) throw error;
    }
    this.states.set(game.id, initialState());
  }

  private async refresh(): Promise<void> {
    if (this.busy) return;
    for (const game of this.config.games) {
      try {
        await this.refreshGame(game);
      } catch (error) {
        const current = this.states.get(game.id) ?? initialState();
        if (current.phase !== "stopped") this.set(game.id, { error: message(error) });
      }
    }
  }

  private async refreshGame(game: GameDefinition): Promise<void> {
    const summary = await this.findContainer(game.id);
    if (!summary) {
      const current = this.states.get(game.id);
      if (!current || !["pulling", "creating", "stopping", "error"].includes(current.phase)) {
        this.states.set(game.id, initialState());
      }
      return;
    }

    if (summary.State !== "running") {
      const current = this.states.get(game.id) ?? initialState();
      if (["pulling", "creating", "starting", "online"].includes(current.phase)) {
        const details = await this.docker.getContainer(summary.Id).inspect();
        const reason = details.State.Error || `The game process exited with code ${details.State.ExitCode}`;
        this.set(game.id, { phase: "error", progress: 0, detail: "Server stopped unexpectedly", error: reason });
      } else if (current.phase !== "error") {
        this.states.set(game.id, initialState());
      }
      return;
    }

    const details = await this.docker.getContainer(summary.Id).inspect();
    const startedAt = details.State.StartedAt || this.states.get(game.id)?.startedAt || new Date().toISOString();
    const current = this.states.get(game.id) ?? initialState();
    if (!details.State.Running) {
      this.set(game.id, { phase: "error", progress: 0, detail: "Server stopped unexpectedly", error: details.State.Error });
      return;
    }

    const queried = await this.query(game);
    if (queried) {
      const now = new Date().toISOString();
      const hadPlayers = Boolean(current.hadPlayers || queried.playerCount > 0);
      const lastPlayerSeenAt = queried.playerCount > 0 ? now : current.lastPlayerSeenAt;
      this.states.set(game.id, {
        ...current,
        phase: "online",
        progress: 100,
        detail: queried.playerCount > 0 ? `${queried.playerCount} playing now` : "Online and ready to join",
        startedAt,
        playerCount: queried.playerCount,
        maxPlayers: queried.maxPlayers,
        playerNames: queried.playerNames,
        lastQueryAt: now,
        lastPlayerSeenAt,
        hadPlayers,
        error: undefined,
      });
      await this.maybeAutoStop(game, startedAt, hadPlayers, queried.playerCount, lastPlayerSeenAt);
      return;
    }

    const logLines = await this.logs(game.id);
    const logText = logLines.join("\n");
    const marker = [...game.startup.markers]
      .sort((a, b) => b.progress - a.progress)
      .find((candidate) => new RegExp(candidate.pattern, "i").test(logText));
    const elapsedSeconds = Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000);
    if (marker?.progress === 100 || elapsedSeconds >= game.startup.timeoutSeconds) {
      this.set(game.id, {
        phase: "online",
        progress: 100,
        detail: marker?.label ?? "Running; player count is unavailable",
        startedAt,
        playerCount: undefined,
        maxPlayers: undefined,
      });
    } else {
      const estimated = Math.min(92, 65 + Math.round((elapsedSeconds / game.startup.timeoutSeconds) * 25));
      this.set(game.id, {
        phase: "starting",
        progress: Math.max(estimated, marker?.progress ?? 0),
        detail: marker?.label ?? "Loading the world…",
        startedAt,
      });
    }
  }

  private async query(game: GameDefinition): Promise<{
    playerCount: number;
    maxPlayers: number;
    playerNames: string[];
  } | undefined> {
    if (!game.query) return undefined;
    try {
      const result = await GameDig.query({
        type: game.query.type,
        host: `game-${game.id}`,
        port: game.query.port,
        maxRetries: 0,
        socketTimeout: 2_000,
        attemptTimeout: 5_000,
        givenPortOnly: true,
        username: game.query.username ? resolveValue(game.query.username) : undefined,
        password: game.query.password ? resolveValue(game.query.password) : undefined,
        rejectUnauthorized: game.query.rejectUnauthorized,
      });
      return {
        playerCount: result.numplayers,
        maxPlayers: result.maxplayers,
        playerNames: result.players.map((player) => player.name).filter(Boolean),
      };
    } catch {
      return undefined;
    }
  }

  private async maybeAutoStop(
    game: GameDefinition,
    startedAt: string,
    hadPlayers: boolean,
    playerCount: number,
    lastPlayerSeenAt?: string,
  ): Promise<void> {
    const policy = this.config.settings.autoStop;
    if (!policy.enabled || playerCount > 0) return;
    const runtimeMinutes = (Date.now() - new Date(startedAt).getTime()) / 60_000;
    if (runtimeMinutes < policy.startupGraceMinutes) return;

    const idleMinutes = lastPlayerSeenAt
      ? (Date.now() - new Date(lastPlayerSeenAt).getTime()) / 60_000
      : runtimeMinutes;
    const shouldStop = hadPlayers ? idleMinutes >= policy.idleMinutes : runtimeMinutes >= policy.neverJoinedMinutes;
    if (shouldStop) {
      this.busy = true;
      try {
        await this.stopInternal(game);
      } finally {
        this.busy = false;
      }
    }
  }
}

export { decodeDockerLogs };
