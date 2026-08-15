export type Protocol = "tcp" | "udp";

export interface PortDefinition {
  container: number;
  host: number;
  protocol: Protocol;
  label: string;
  public: boolean;
}

export interface StartupMarker {
  pattern: string;
  progress: number;
  label: string;
}

export interface GameDefinition {
  id: string;
  name: string;
  edition?: string;
  description: string;
  image: string;
  imageUrl?: string;
  color: string;
  memoryMb: number;
  cpus: number;
  stopSeconds?: number;
  enabled?: boolean;
  warning?: string;
  ports: PortDefinition[];
  volume: { source: string; target: string };
  environment: Record<string, string>;
  requiredEnvironment?: string[];
  query?: {
    type: string;
    port: number;
    username?: string;
    password?: string;
    rejectUnauthorized?: boolean;
  };
  startup: {
    timeoutSeconds: number;
    markers: StartupMarker[];
  };
}

export interface SwitchConfig {
  version: number;
  settings: {
    budgetMemoryMb: number;
    maxConcurrent: number;
    dockerNetwork: string;
    publicHost: string;
    autoStop: {
      enabled: boolean;
      idleMinutes: number;
      neverJoinedMinutes: number;
      startupGraceMinutes: number;
      pollSeconds: number;
    };
  };
  games: GameDefinition[];
}

export type GamePhase =
  | "stopped"
  | "pulling"
  | "creating"
  | "starting"
  | "online"
  | "stopping"
  | "error";

export interface RuntimeState {
  phase: GamePhase;
  progress: number;
  detail: string;
  startedAt?: string;
  playerCount?: number;
  maxPlayers?: number;
  playerNames?: string[];
  lastQueryAt?: string;
  lastPlayerSeenAt?: string;
  hadPlayers?: boolean;
  error?: string;
  memoryBytes?: number;
  cpuPercent?: number;
}

export interface GameView extends RuntimeState {
  id: string;
  name: string;
  edition?: string;
  description: string;
  color: string;
  memoryMb: number;
  cpus: number;
  enabled: boolean;
  warning?: string;
  connection: string;
  ports: Array<PortDefinition & { connection: string }>;
  imageUrl?: string;
}

