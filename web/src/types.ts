export type GamePhase = "stopped" | "pulling" | "creating" | "starting" | "online" | "stopping" | "error";

export interface Game {
  id: string;
  name: string;
  edition?: string;
  description: string;
  color: string;
  memoryMb: number;
  cpus: number;
  enabled: boolean;
  warning?: string;
  phase: GamePhase;
  progress: number;
  detail: string;
  connection: string;
  ports: Array<{
    container: number;
    host: number;
    protocol: "tcp" | "udp";
    label: string;
    public: boolean;
    connection: string;
  }>;
  startedAt?: string;
  playerCount?: number;
  maxPlayers?: number;
  playerNames?: string[];
  error?: string;
}

export interface SwitchSettings {
  budgetMemoryMb: number;
  maxConcurrent: number;
  publicHost: string;
  autoStop: {
    enabled: boolean;
    idleMinutes: number;
    neverJoinedMinutes: number;
    startupGraceMinutes: number;
    pollSeconds: number;
  };
}

export interface GamesResponse {
  games: Game[];
  settings: SwitchSettings;
}

