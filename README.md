<p align="center">
  <img src="icon.svg" alt="I2P Logo" width="21%">
</p>

# I2P on StartOS

> **Upstream docs:** <https://i2pd.readthedocs.io/>
>
> Everything not listed in this document should behave the same as upstream
> I2Pd. If a feature, setting, or behavior is not mentioned here, the
> upstream documentation is accurate and fully applicable.

Peer-to-peer network for I2P services and decentralized applications. Run I2P
services (.b32.i2p addresses) to make your installed apps accessible over the
I2P network. Provides SOCKS and HTTP proxies for accessing I2P addresses, and
can optionally operate as a floodfill node to support the network.

- **Upstream repo:** <https://github.com/PurpleI2P/i2pd>
- **Wrapper repo:** <https://github.com/crissuper20/i2p-startos>

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Configuration Management](#configuration-management)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Actions](#actions-startos-ui)
- [URL Plugin](#url-plugin)
- [Backups and Restore](#backups-and-restore)
- [Health Checks](#health-checks)
- [Limitations and Differences](#limitations-and-differences)
- [What Is Unchanged from Upstream](#what-is-unchanged-from-upstream)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

| Property      | Value                                         |
| ------------- | --------------------------------------------- |
| Base image    | Alpine Linux edge with upstream `i2pd` package |
| Architectures | x86_64, aarch64, riscv64                      |
| Entrypoint    | `i2pd --conf=/var/lib/i2pd/i2pd.conf --datadir=/var/lib/i2pd` |
| User          | `i2pd` (non-root)                              |

The image is minimal, just Alpine + the `i2pd` package. No custom patches
or modifications to the I2Pd binary.

---

## Volume and Data Layout

| Volume    | Mount Point     | Contents                                               |
| --------- | --------------- | ------------------------------------------------------ |
| `i2pd`    | `/var/lib/i2pd` | I2P data directory, tunnel keys, config files          |

The `i2pd.conf` and `tunnels.conf` files are stored on the `i2pd` volume and
are the single source of truth for all I2P tunnel and floodfill settings. They
are generated from structured data and round-trip cleanly (metadata is embedded
as `# @service` comment annotations).

I2P tunnel keys are stored under
`/var/lib/i2pd/tunnels/<packageId>/<hostId>/tunnel_<index>/`.

---

## Installation and First-Run Flow

1. No setup wizard or credentials -- I2Pd starts immediately with SOCKS and
   HTTP proxies on ports 4447 and 4444 respectively.
2. I2P services (tunnels) are added via the URL plugin (see below).
3. **Bootstrap takes 3-10 minutes** for I2Pd to integrate into the I2P network.

---

## Configuration Management

All configuration is managed through StartOS actions and the URL plugin.
There is no upstream configuration UI.

| Setting               | Managed By  | Method                                      |
| --------------------- | ----------- | ------------------------------------------- |
| I2P tunnels (services)| URL plugin  | Add/remove via service interface URLs        |
| Router settings       | Action      | Configure Router                             |
| SOCKS proxy port      | Hardcoded   | Always `0.0.0.0:4447`                       |
| HTTP proxy port       | Hardcoded   | Always `0.0.0.0:4444`                       |
| Data directory        | Hardcoded   | Always `/var/lib/i2pd`                       |
| HTTP API              | Hardcoded   | `127.0.0.1:7070` (for health checks)         |

---

## Network Access and Interfaces

### SOCKS Proxy (I2P network only)

- **Port:** 4447
- **Protocol:** SOCKS5
- **Purpose:** Access .b32.i2p addresses over the I2P network
- **Binding:** `0.0.0.0:4447` (accessible to other services and LAN)
- **Limitation:** Cannot be used as a general privacy proxy like Tor's SOCKS5

### HTTP Proxy (I2P network only)

- **Port:** 4444
- **Protocol:** HTTP
- **Purpose:** HTTP access to .b32.i2p addresses
- **Binding:** `0.0.0.0:4444` (accessible to other services and LAN)
- **Limitation:** Cannot be used as a general privacy proxy

### Floodfill Node (conditional)

- **Enabled via:** Configure Router action (Floodfill toggle)
- **Purpose:** Participate as a floodfill node to support the I2P network
- **Only active when floodfill is enabled in Configure Router**

---

## Actions (StartOS UI)

### Configure Router

- **ID:** `configure-router`
- **Visibility:** Enabled (user-facing)
- **Purpose:** Configure I2P router settings
- **Availability:** Any status
- **Inputs:**
  - **Floodfill** -- participate as a floodfill node (default: off; requires ≥ Standard bandwidth)
  - **Bandwidth** -- Low (32 KB/s), Standard (256 KB/s), High (full speed), Unlimited (default: Standard)
  - **Transit Tunnels** -- relay traffic for other I2P users (default: on)
  - **Log Level** -- none / error / warn / info / debug (default: warn)

### Reseed Router

- **ID:** `reseed-router`
- **Visibility:** Enabled (user-facing)
- **Purpose:** Re-download router information from reseed servers
- **Availability:** Any status

### Add I2P Tunnel (hidden)

- **ID:** `add-i2p-tunnel`
- **Visibility:** Hidden (invoked by the URL plugin, not directly by users)
- **Purpose:** Add an I2P server tunnel for a specific service interface URL
- **Inputs:**
  - **SSL** -- whether to serve with SSL (hidden if interface doesn't support it)
  - **Address** -- choose an existing .b32.i2p address or create a new one

### Delete I2P Tunnel (hidden)

- **ID:** `delete-i2p-tunnel`
- **Visibility:** Hidden (invoked by the URL plugin)
- **Purpose:** Remove a specific port binding from an I2P tunnel; deletes
  the entire .b32.i2p address and keys if no port bindings remain

---

## URL Plugin

I2P registers as a `url-v0` plugin, which integrates with the StartOS
interface URL system. This allows users to add/remove .b32.i2p addresses for
any service's interface directly from the service's URL table.

- **Table action:** `add-i2p-tunnel` -- appears in the URL table for all services
- **Remove action:** `delete-i2p-tunnel` -- attached to each exported .b32.i2p URL
- **Stale cleanup:** On init, entries referencing interfaces that no longer
  exist are automatically removed along with their key material

---

## Backups and Restore

- **Backed up:** Entire `i2pd` volume (I2P tunnel keys, config files)
- **Restore behavior:** Volume-level restore; I2P tunnel keys are preserved,
  so .b32.i2p addresses survive backup/restore cycles.
- **Uninstall warning:** Uninstalling I2P permanently deletes all I2P tunnel
  keys and .b32.i2p addresses.

---

## Health Checks

- **Method:** Queries I2Pd's HTTP API on `127.0.0.1:7070`
- **States:**
  - **Loading** -- "I2Pd is loading — integrating into network (this takes several minutes)"
  - **Success** -- "I2Pd is running" (once fully bootstrapped)
  - **Failure** -- "I2Pd is not responding" (HTTP API unreachable or timeout)
- **Timeout:** 5 seconds per check
- **Note:** Bootstrap typically takes **3-10 minutes** vs. 30 seconds for Tor

---

## Limitations and Differences

1. **I2P-network-only proxies.** SOCKS and HTTP proxies only work for .b32.i2p
   addresses, not as general privacy proxies like Tor's SOCKS5.
2. **Longer bootstrap time.** Integration into the I2P network takes 3-10
   minutes vs. 30 seconds for Tor.
3. **Floodfill, not relay/bridge.** I2P uses floodfill nodes instead of Tor's
   relay/bridge architecture.
4. **No SAM protocol exposure.** This package does not expose the SAM (Simple
   Anonymous Messaging) API.

---

## What Is Unchanged from Upstream

- I2Pd binary is the upstream Alpine package, unmodified
- I2P tunnel protocol behavior
- I2P network bootstrap and peer discovery
- Floodfill node participation
- SOCKS proxy protocol (for I2P addresses)
- HTTP proxy protocol (for I2P addresses)

---

## Quick Reference for AI Consumers

```yaml
package_id: i2p
image: Alpine Linux edge + i2pd package
architectures: [x86_64, aarch64, riscv64]
volumes:
  i2pd: /var/lib/i2pd
ports:
  socks: 4447 (I2P-network-only, 0.0.0.0)
  http_proxy: 4444 (I2P-network-only, 0.0.0.0)
  http_api: 7070 (localhost, health checks only)
dependencies: none
plugins: [url-v0]
startos_managed_config:
  - i2pd.conf (generated from structured data)
  - tunnels.conf (generated from structured data, round-trips via comment annotations)
actions:
  - configure-router (user-facing)
  - reseed-router (user-facing)
  - add-i2p-tunnel (hidden, URL plugin)
  - delete-i2p-tunnel (hidden, URL plugin)
languages: [en_US, es_ES, de_DE, pl_PL, fr_FR]
bootstrap_time: 3-10 minutes
```
