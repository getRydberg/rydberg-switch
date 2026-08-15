# Rydberg Switch

Rydberg Switch is a private, friend-friendly dashboard for starting one dedicated game server at a time. It keeps each world's data between sessions, shows startup progress and player counts, and automatically stops an empty server so the rest of the host stays available.

The initial catalog includes:

- Minecraft: Java Edition
- Palworld
- Satisfactory
- ARK: Survival Evolved (ASE)

ARK: Survival Ascended is deliberately not included. Its dedicated server is a separate, Windows-oriented workload and is a poor fit for this Linux host's strict 16 GB Switch budget.

## Design at a glance

- **One controller container:** serves the built web app and talks to Docker through the local socket.
- **One game at a time:** a launch is refused while an operation is in progress, and switching requires the current server to stop and save first.
- **15 GB game ceiling:** the game catalog is capped at 15,360 MB; the controller itself is capped at 512 MB, keeping the whole project at or below roughly 16 GB.
- **Persistent worlds:** every game receives its own named Docker volume. Stopping or recreating a container does not delete the world.
- **No GPU access:** game containers receive no Arc GPU devices. Each also gets a CPU quota.
- **Automatic cleanup:** after the server has seen players, it stops after 20 empty minutes. A server nobody joins stops after 60 minutes.
- **Private control plane:** every dashboard/API action requires the shared access key. The API is never directly published on a host port.

## Before the first build

1. Copy `.env.example` to `.env`.
2. Replace every `change-me` value and set a long, random `SWITCH_ACCESS_KEY`.
3. Read the [Minecraft EULA](https://aka.ms/MinecraftEULA). Only set `MINECRAFT_EULA=TRUE` if you accept it.
4. Confirm `PUID` and `PGID` match the account that should own server files (usually `1000` and `1000`).
5. Leave `RYDBERG_NETWORK=rydberg-net`; this is the external network used by the existing Rydberg core, Traefik, and Cloudflare Tunnel.

The project follows the Rydberg module contract through `.rydberg-module`, namespaced services, the `switch` profile, environment-based configuration, and the external `rydberg-net` network.

## Build and run

Build on the server when you are ready:

```bash
cp .env.example .env
# edit .env first
docker compose --profile switch up -d --build
```

If installed through the Rydberg CLI, `rydberg up switch` activates the module profile instead.

The controller creates game containers only after an authenticated friend presses **Start this server**. The first launch can take a long time because the server image and game files must download; ARK is especially large.

Useful owner commands:

```bash
docker compose --profile switch logs -f controller-switch
docker ps --filter label=app.rydberg.switch.managed=true
docker volume ls --filter name=rydberg-switch
```

Do not run `docker compose down -v` and do not manually delete the `rydberg-switch-*` volumes unless you intend to erase worlds.

## Domains and networking

The two domains do different jobs:

- `switch.rydberg.app` is HTTP traffic. Keep it behind the existing Cloudflare Tunnel, which reaches Traefik on `rydberg-net` and routes the hostname to this controller.
- `play.rydberg.app` is native game TCP/UDP traffic. Create a **DNS-only** Cloudflare record pointing to the server's public IP. Standard Cloudflare HTTP proxying and Tunnel do not carry arbitrary game UDP traffic.

See [docs/NETWORKING.md](docs/NETWORKING.md) for the exact router/firewall table, DNS steps, CGNAT warning, and game connection addresses.

## Configuration

The dashboard behavior and game catalog live in `games/games.json`. Secrets stay in `.env` and are referenced as `${VARIABLE_NAME}`. A missing required secret blocks that server from starting and returns a useful message in the UI.

The controller recreates a stopped game container when its definition changes. It never removes the game's named volume.

See [docs/ADDING_GAMES.md](docs/ADDING_GAMES.md) for the extension format and checklist.

## Security notes

The Docker socket is intentionally mounted because Switch creates and manages game containers on demand. Access to that socket is effectively host-administrator access, so:

- never publish controller port `8080` to the host;
- keep the dashboard behind Cloudflare Tunnel and HTTPS;
- use a unique, high-entropy access key;
- do not add untrusted game images or let dashboard users edit container definitions;
- keep `.env` out of git;
- consider adding Cloudflare Access in front of the dashboard for per-person identity if the shared key ever becomes inconvenient.

Only containers bearing `app.rydberg.switch.managed=true` are controlled by Switch. It does not stop or modify unrelated Rydberg workloads.

