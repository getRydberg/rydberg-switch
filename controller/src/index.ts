import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { clearSession, createSession, isAuthenticated, requireAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { SwitchController } from "./docker-controller.js";
import { registerFrontendRoutes } from "./frontend.js";

const port = Number(process.env.PORT ?? 8080);
const configPath = process.env.GAMES_CONFIG ?? "/app/games/games.json";
const staticPath = process.env.STATIC_DIR ?? "/app/public";
const accessKey = process.env.SWITCH_ACCESS_KEY?.trim();
const publicOrigin = process.env.PUBLIC_ORIGIN?.replace(/\/$/, "");
const secureCookies = (process.env.SECURE_COOKIES ?? "true").toLowerCase() !== "false";

if (!accessKey || accessKey.length < 10) {
  throw new Error("SWITCH_ACCESS_KEY must be set to at least 10 characters");
}

const config = await loadConfig(configPath);
const controller = new SwitchController(config);
await controller.initialize();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (request.path.startsWith("/api/")) response.setHeader("Cache-Control", "no-store");
  next();
});

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.get("/api/session", (request, response) => response.json({ authenticated: isAuthenticated(request, accessKey) }));

app.post("/api/session", (request, response) => {
  const ip = request.ip ?? "unknown";
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    response.status(429).json({ error: "Too many tries. Wait a few minutes and try again." });
    return;
  }
  const submitted = typeof request.body?.accessKey === "string" ? request.body.accessKey : "";
  if (submitted !== accessKey) {
    loginAttempts.set(ip, { count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1, resetAt: now + 10 * 60_000 });
    response.status(401).json({ error: "That access key did not match" });
    return;
  }
  loginAttempts.delete(ip);
  createSession(response, accessKey, secureCookies);
  response.json({ authenticated: true });
});

app.post("/api/logout", requireAuth(accessKey), (_request, response) => {
  clearSession(response, secureCookies);
  response.status(204).end();
});

app.use("/api", (request, response, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && publicOrigin) {
    const origin = request.get("origin");
    if (origin && origin !== publicOrigin) {
      response.status(403).json({ error: "Request origin was not allowed" });
      return;
    }
  }
  next();
});

app.get("/api/games", requireAuth(accessKey), (_request, response) => {
  response.json({ games: controller.views(), settings: controller.settings() });
});

app.post("/api/games/:id/start", requireAuth(accessKey), async (request, response) => {
  await run(response, async () => {
    await controller.start(routeId(request));
    response.status(202).json({ ok: true });
  });
});

app.post("/api/games/:id/stop", requireAuth(accessKey), async (request, response) => {
  await run(response, async () => {
    await controller.stop(routeId(request));
    response.status(202).json({ ok: true });
  });
});

app.get("/api/games/:id/logs", requireAuth(accessKey), async (request, response) => {
  await run(response, async () => {
    response.json({ lines: await controller.logs(routeId(request)) });
  });
});

registerFrontendRoutes(app, staticPath);

app.use((error: unknown, _request: Request, response: Response, _next: unknown) => {
  console.error(error);
  if (!response.headersSent) response.status(500).json({ error: "Something went wrong" });
});

app.listen(port, "0.0.0.0", () => console.log(`Rydberg Switch listening on ${port}`));

async function run(response: Response, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const status = detail.includes("already in progress") ? 409 : detail.includes("Unknown") ? 404 : 400;
    response.status(status).json({ error: detail });
  }
}

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
