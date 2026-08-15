# Networking and domains

## 1. Dashboard: `switch.rydberg.app`

Add a public hostname to the existing Cloudflare Tunnel:

| Setting | Value |
|---|---|
| Public hostname | `switch.rydberg.app` |
| Service type | HTTP |
| Upstream | `http://traefik:80` |

Traefik receives that request over `rydberg-net`. The labels in `docker-compose.yml` match the `Host(switch.rydberg.app)` request and send it to controller port 8080.

No dashboard port needs to be opened on the router.

## 2. Game traffic: `play.rydberg.app`

In Cloudflare DNS, create an `A` record:

| Type | Name | Target | Proxy status |
|---|---|---|---|
| A | `play` | your public IPv4 address | **DNS only** (gray cloud) |

If the ISP changes the public address, use a trusted dynamic-DNS updater for the Cloudflare record. An `AAAA` record is optional, but only create one after matching IPv6 firewall rules are in place.

Cloudflare's normal orange-cloud proxy only supports web traffic on its allowed ports. Cloudflare Spectrum can proxy game TCP/UDP, but custom protocols generally require an Enterprise plan. The practical home-server setup is therefore DNS-only plus explicit router/firewall forwarding.

If the router's WAN address differs from the address shown by a public IP checker, the connection may be behind CGNAT. Port forwarding will not work until the ISP supplies a public address, or you choose a game-aware tunnel/VPN that every friend can use.

## 3. Router and host firewall

Forward these ports from the router to the Rydberg server's fixed LAN address. The same public port is used inside and outside.

| Game | Port | Protocol | Purpose | What friends enter |
|---|---:|---|---|---|
| Minecraft Java | 25565 | TCP | Game | `play.rydberg.app:25565` |
| Palworld | 8211 | UDP | Game | `play.rydberg.app:8211` |
| Palworld | 27015 | UDP | Query/server list | Nothing; the game uses it |
| Satisfactory | 7777 | TCP + UDP | Game/API | `play.rydberg.app:7777` |
| Satisfactory | 8888 | TCP | Reliable messaging | Nothing; the game uses it |
| ARK: Survival Evolved | 7777 | UDP | Game | Usually connect through the server browser |
| ARK: Survival Evolved | 7778 | UDP | Raw socket | Nothing; must remain game port + 1 |
| ARK: Survival Evolved | 27015 | UDP | Steam server list/query | Add `play.rydberg.app:27015` to Steam favorites |

The Palworld REST status port `8212/tcp` and ARK RCON port `27020/tcp` are internal-only. Do **not** forward them.

Satisfactory and ARK intentionally reuse port 7777 because Switch guarantees only one game container runs at a time. Palworld and ARK similarly reuse 27015/udp.

Example `firewalld` commands (run only for games you plan to expose):

```bash
sudo firewall-cmd --permanent --add-port=25565/tcp
sudo firewall-cmd --permanent --add-port=8211/udp
sudo firewall-cmd --permanent --add-port=27015/udp
sudo firewall-cmd --permanent --add-port=7777/tcp
sudo firewall-cmd --permanent --add-port=7777-7778/udp
sudo firewall-cmd --permanent --add-port=8888/tcp
sudo firewall-cmd --reload
```

## 4. Verification

1. Open `switch.rydberg.app`, sign in, and start one game.
2. Wait until the card says **Online**. First installs can be much slower than later starts.
3. Test from outside the home network (for example, a phone hotspot). Testing from the same LAN can fail on routers without NAT loopback even when outside access works.
4. If a game cannot connect, check in order: container activity, host firewall, router forwarding, DNS-only status, public IP/CGNAT, then the game-specific port.

