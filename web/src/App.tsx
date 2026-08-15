import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Game, GamesResponse } from "./types";

const RUNNING_PHASES = new Set(["pulling", "creating", "starting", "online", "stopping"]);

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 36 36" role="img">
        <path d="M10 6v24M10 18h8c5.5 0 8-2.4 8-6s-2.5-6-8-6h-8M17 18l10 12" />
      </svg>
    </span>
  );
}

function ArrowIcon() {
  return <svg className="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>;
}

function CopyIcon({ done }: { done: boolean }) {
  return done
    ? <svg className="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
    : <svg className="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="2" /><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /></svg>;
}

function ServerGlyph({ id }: { id: string }) {
  if (id === "minecraft") return <div className="voxel"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>;
  if (id === "palworld") return <div className="pal-glyph"><span /><span /><b /></div>;
  if (id === "satisfactory") return <div className="factory-glyph"><span /><span /><span /></div>;
  return <div className="ark-glyph">A</div>;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(key);
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="login-card">
        <div className="login-brand"><BrandMark /><span>RYDBERG</span></div>
        <p className="eyebrow">Private game cloud</p>
        <h1>Pick a world.<br />Bring it online.</h1>
        <p className="login-copy">A quiet little switchboard for game nights. Enter the shared access key to continue.</p>
        <form onSubmit={submit}>
          <label htmlFor="access-key">Access key</label>
          <div className="login-input-row">
            <input id="access-key" type="password" autoComplete="current-password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="••••••••••••" autoFocus />
            <button type="submit" disabled={busy || !key}>{busy ? "Checking…" : "Enter"}<ArrowIcon /></button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
        <p className="login-foot"><span className="pulse-dot" />Hosted at home · Friends only</p>
      </section>
    </main>
  );
}

function PhaseBadge({ game }: { game: Game }) {
  const labels: Record<Game["phase"], string> = { stopped: "Offline", pulling: "Downloading", creating: "Preparing", starting: "Starting", online: "Online", stopping: "Saving", error: "Needs attention" };
  return <span className={`phase-badge phase-${game.phase}`}><i />{labels[game.phase]}</span>;
}

function GameCard({ game, active, onStart }: { game: Game; active?: Game; onStart: (game: Game) => void }) {
  const blocked = Boolean(active && active.id !== game.id && RUNNING_PHASES.has(active.phase));
  const ram = game.memoryMb >= 1024 ? `${Math.round(game.memoryMb / 1024)} GB` : `${game.memoryMb} MB`;
  return (
    <article className={`game-card ${game.phase !== "stopped" ? "is-active" : ""}`} style={{ "--game-color": game.color } as CSSProperties}>
      <div className="game-art"><div className="art-orbit" /><ServerGlyph id={game.id} /></div>
      <div className="game-card-body">
        <div className="game-title-row"><div><p>{game.edition ?? "Dedicated server"}</p><h3>{game.name}</h3></div><PhaseBadge game={game} /></div>
        <p className="game-description">{game.description}</p>
        <div className="game-meta"><span>{ram} RAM</span><i /><span>{game.cpus} CPU cores</span><i /><span>Port {game.ports[0]?.host ?? "—"}</span></div>
        {game.warning && <p className="game-warning">{game.warning}</p>}
        <button className="start-button" onClick={() => onStart(game)} disabled={!game.enabled || blocked || RUNNING_PHASES.has(game.phase)}>
          {game.phase === "online" ? "Currently running" : blocked ? `${active?.name} is running` : game.enabled ? "Start this server" : "Not configured"}
          {!blocked && game.phase === "stopped" && <ArrowIcon />}
        </button>
      </div>
    </article>
  );
}

function ActiveServer({ game, onStop, onLogs }: { game: Game; onStop: () => void; onLogs: () => void }) {
  const [copied, setCopied] = useState(false);
  const isOnline = game.phase === "online";
  async function copyAddress() {
    await navigator.clipboard.writeText(game.connection);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <section className={`active-server ${isOnline ? "online" : "warming"}`} style={{ "--game-color": game.color } as CSSProperties}>
      <div className="active-glow" />
      <div className="active-main">
        <div className="active-kicker"><PhaseBadge game={game} /><span>{game.name}</span></div>
        <h2>{isOnline ? "Your world is ready." : game.phase === "stopping" ? "Saving every last block…" : "Bringing your world online…"}</h2>
        <p>{game.error ?? game.detail}</p>
        <div className="progress-track" aria-label={`${game.progress}% complete`}><span style={{ width: `${game.progress}%` }} /></div>
        <div className="progress-labels"><span>{game.detail}</span><strong>{game.progress}%</strong></div>
        {isOnline && <div className="connection-panel"><div><span>Connect with</span><strong>{game.connection}</strong></div><button onClick={copyAddress} aria-label="Copy server address"><CopyIcon done={copied} />{copied ? "Copied" : "Copy"}</button></div>}
      </div>
      <aside className="active-side">
        <div className="players-stat"><span>Players online</span><strong>{game.playerCount ?? "—"}<small>{game.maxPlayers ? ` / ${game.maxPlayers}` : ""}</small></strong><div className="player-faces">
          {(game.playerNames?.length ? game.playerNames : Array.from({ length: Math.min(game.playerCount ?? 0, 4) }, (_, i) => `Player ${i + 1}`)).slice(0, 4).map((name, index) => <i key={`${name}-${index}`} title={name}>{name.slice(0, 1).toUpperCase()}</i>)}
          {game.playerCount === 0 && <em>Waiting for the crew</em>}{game.playerCount == null && <em>Checking server…</em>}
        </div></div>
        <div className="active-actions"><button className="text-button" onClick={onLogs}>View activity</button><button className="stop-button" onClick={onStop} disabled={game.phase === "stopping"}>Stop server</button></div>
      </aside>
    </section>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h3>{title}</h3><button onClick={onClose} aria-label="Close">×</button></div>{children}</section></div>;
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<GamesResponse>();
  const [error, setError] = useState("");
  const [confirmStop, setConfirmStop] = useState<Game>();
  const [logs, setLogs] = useState<{ game: Game; lines: string[] }>();
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api.games()); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Status unavailable"); }
  }, []);

  useEffect(() => { void load(); const interval = window.setInterval(() => void load(), 3_000); return () => window.clearInterval(interval); }, [load]);
  const active = useMemo(() => data?.games.find((game) => RUNNING_PHASES.has(game.phase)), [data]);

  async function start(game: Game) {
    setActing(true); setError("");
    try { await api.start(game.id); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the server"); }
    finally { setActing(false); }
  }
  async function stop() {
    if (!confirmStop) return;
    setActing(true); setError("");
    try { await api.stop(confirmStop.id); setConfirmStop(undefined); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not stop the server"); }
    finally { setActing(false); }
  }
  async function showLogs(game: Game) {
    try { setLogs({ game, lines: (await api.logs(game.id)).lines }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load activity"); }
  }

  if (!data) return <div className="loading-screen"><BrandMark /><span>Opening the switchboard…</span>{error && <p>{error}</p>}</div>;
  const budgetGb = Math.round(data.settings.budgetMemoryMb / 1024);
  return (
    <div className="app-shell">
      <header><a className="brand" href="/" aria-label="Rydberg Switch home"><BrandMark /><span><b>RYDBERG</b><small>SWITCH</small></span></a><nav><span><i className={active ? "live" : ""} />{active ? "1 server active" : "All servers resting"}</span><button onClick={onLogout}>Sign out</button></nav></header>
      <main className="dashboard">
        <section className="intro"><div><p className="eyebrow">Game night, on demand</p><h1>Where are we<br /><em>playing tonight?</em></h1></div><div className="budget-card"><span>Shared game budget</span><strong>{budgetGb}<small> GB</small></strong><p>One world at a time keeps the rest of Rydberg running smoothly.</p></div></section>
        {error && <div className="notice" role="alert"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}
        {active && <ActiveServer game={active} onStop={() => setConfirmStop(active)} onLogs={() => void showLogs(active)} />}
        <section className="library"><div className="section-heading"><div><p className="eyebrow">The library</p><h2>Choose a server</h2></div><p>{active ? "Stop the active server before switching worlds." : "Starting may take a few minutes the first time."}</p></div><div className="game-grid">{data.games.map((game) => <GameCard key={game.id} game={game} active={active} onStart={(selected) => void start(selected)} />)}</div></section>
        <section className="how-it-works"><div><span>01</span><h3>Choose a world</h3><p>Only one dedicated server runs at a time.</p></div><div><span>02</span><h3>Wait for ready</h3><p>Keep this page open and watch startup progress.</p></div><div><span>03</span><h3>Join your friends</h3><p>Use <strong>{data.settings.publicHost}</strong> with the shown port.</p></div><div><span>04</span><h3>We tidy up</h3><p>{data.settings.autoStop.enabled ? `The server stops ${data.settings.autoStop.idleMinutes} minutes after everyone leaves.` : "Stop the server here when game night ends."}</p></div></section>
      </main>
      <footer><span>Rydberg Switch</span><p>Private infrastructure for very important adventures.</p><span>v0.1</span></footer>
      {confirmStop && <Modal title={`Stop ${confirmStop.name}?`} onClose={() => setConfirmStop(undefined)}><div className="confirm-copy"><p>The world will save before shutting down. This can take up to a couple of minutes.</p><div><button className="text-button" onClick={() => setConfirmStop(undefined)}>Keep playing</button><button className="danger-button" onClick={() => void stop()} disabled={acting}>{acting ? "Saving…" : "Save & stop"}</button></div></div></Modal>}
      {logs && <Modal title={`${logs.game.name} activity`} onClose={() => setLogs(undefined)}><pre className="logs">{logs.lines.length ? logs.lines.join("\n") : "No activity yet."}</pre></Modal>}
      {acting && <div className="action-indicator">Sending to the switchboard…</div>}
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<"loading" | "yes" | "no">("loading");
  useEffect(() => { void api.session().then((result) => setAuth(result.authenticated ? "yes" : "no")).catch(() => setAuth("no")); }, []);
  if (auth === "loading") return <div className="loading-screen"><BrandMark /><span>Waking up Rydberg…</span></div>;
  if (auth === "no") return <Login onSuccess={() => setAuth("yes")} />;
  return <Dashboard onLogout={() => void api.logout().finally(() => setAuth("no"))} />;
}

