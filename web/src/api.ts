import type { GamesResponse } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "The request could not be completed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  session: () => request<{ authenticated: boolean }>("/api/session"),
  login: (accessKey: string) => request<{ authenticated: boolean }>("/api/session", {
    method: "POST",
    body: JSON.stringify({ accessKey }),
  }),
  logout: () => request<void>("/api/logout", { method: "POST" }),
  games: () => request<GamesResponse>("/api/games"),
  start: (id: string) => request<{ ok: true }>(`/api/games/${id}/start`, { method: "POST" }),
  stop: (id: string) => request<{ ok: true }>(`/api/games/${id}/stop`, { method: "POST" }),
  logs: (id: string) => request<{ lines: string[] }>(`/api/games/${id}/logs`),
};

