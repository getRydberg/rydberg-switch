# Adding another game

Adding a server normally requires one new object in `games/games.json`; the controller and dashboard do not need code changes.

## Definition format

Copy an existing game and change these fields:

| Field | Purpose |
|---|---|
| `id` | Lowercase stable identifier; becomes `rydberg-game-<id>` |
| `name`, `edition`, `description`, `color` | Dashboard presentation |
| `image` | Trusted Docker image and tag |
| `memoryMb`, `cpus` | Hard container limits; memory may not exceed the catalog budget |
| `stopSeconds` | Time Docker allows for a graceful save before killing the process |
| `ports` | Container/host port, TCP or UDP, label, and whether it is public |
| `volume` | Unique named volume and the image's persistent-data mount point |
| `environment` | Settings passed to the image; use exact `${ENV_NAME}` values for secrets |
| `requiredEnvironment` | Secret names that must exist before launch is allowed |
| `query` | A [GameDig](https://github.com/gamedig/node-gamedig/blob/master/GAMES_LIST.md) type and internal query port |
| `startup.markers` | Regular expressions matched against recent logs for human-readable progress |

Example skeleton:

```json
{
  "id": "valheim",
  "name": "Valheim",
  "edition": "Dedicated Server",
  "description": "Our next shared world.",
  "image": "trusted-owner/trusted-image:fixed-tag",
  "color": "#87a69b",
  "memoryMb": 6144,
  "cpus": 4,
  "stopSeconds": 120,
  "ports": [
    { "container": 2456, "host": 2456, "protocol": "udp", "label": "Game", "public": true },
    { "container": 2457, "host": 2457, "protocol": "udp", "label": "Game + 1", "public": true }
  ],
  "volume": { "source": "rydberg-switch-valheim", "target": "/config" },
  "environment": {
    "SERVER_NAME": "Rydberg Valheim",
    "SERVER_PASS": "${VALHEIM_PASSWORD}"
  },
  "requiredEnvironment": ["VALHEIM_PASSWORD"],
  "query": { "type": "valheim", "port": 2457 },
  "startup": {
    "timeoutSeconds": 600,
    "markers": [
      { "pattern": "Game server connected", "progress": 100, "label": "Online and ready to join" }
    ]
  }
}
```

Add each referenced secret to `.env.example` with a harmless placeholder, then add the real value only to `.env`.

## Checklist

1. Read the image maintainer's current setup and graceful-shutdown documentation.
2. Verify that the image is Linux `amd64` compatible.
3. Identify the exact persistent directory. Never rely on the writable container layer for saves.
4. Set a realistic memory limit under 15,360 MB and leave headroom inside that limit for non-heap/native memory.
5. Keep RCON, admin APIs, and metrics ports at `"public": false`.
6. Add public ports to the router and host firewall, but leave `play.rydberg.app` DNS-only.
7. Choose a GameDig type if supported. If none exists, log markers still report readiness, but player counts will be unavailable.
8. Test first launch, second launch, graceful stop with a populated world, and automatic idle stop.
9. Pin a known-good image tag or digest after testing. `latest` is convenient during initial setup but makes upgrades less predictable.

## Limits of configuration-only support

Most Linux dedicated servers fit the catalog. A small adapter/code change may still be necessary when a game:

- only provides a Windows executable;
- needs multiple containers or databases;
- requires interactive Steam authentication;
- exposes player data only through a custom authenticated API;
- cannot save gracefully from `SIGTERM`/Docker stop;
- requires more than the 16 GB project budget.

In those cases, leave the game disabled until its lifecycle and save behavior have been tested. Never trade world integrity for a nominally generic launch button.

