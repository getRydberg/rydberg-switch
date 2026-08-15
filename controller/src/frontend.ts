import { resolve } from "node:path";
import express, { type Express } from "express";

export function registerFrontendRoutes(app: Express, staticPath: string): void {
  // API requests must never fall through to the single-page application.
  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "API route not found" });
  });

  app.use(express.static(staticPath, { fallthrough: true, maxAge: "1h", index: false }));

  // Express 5 requires a named wildcard. Braces make the wildcard optional,
  // which allows this route to match both `/` and client-side paths.
  app.get("/{*path}", (_request, response) => {
    response.sendFile(resolve(staticPath, "index.html"));
  });
}

