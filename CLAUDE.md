# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building Packages
```bash
# Build for all architectures (x86_64, aarch64, riscv64)
make

# Build for specific architecture
make x86_64    # builds i2p_x86_64.s9pk
make aarch64   # builds i2p_aarch64.s9pk
make riscv64   # builds i2p_riscv64.s9pk

# Clean build artifacts
make clean
```

### Development Workflow
```bash
# Install dependencies
npm ci

# Build TypeScript to JavaScript
npm run build

# Watch for changes during development
npm run watch
```

### Package Management
```bash
# Install built package to local StartOS instance
make install

# Publish package to registry (requires configuration in ~/.startos/config.yaml)
make publish
```

## Code Architecture

### High-Level Structure
- **startos/**: Main application code written in TypeScript
- **actions/**: StartOS action handlers (configure-router, reseed-router, etc.)
- **manifest/**: Package metadata and version information
- **fileModels/**: Data models for StartOS integration
- **plugin/**: URL plugin implementation for service integration
- **Dockerfile**: Builds Alpine-based image with i2pd package
- **s9pk.mk/Makefile**: Build system for creating StartOS packages (.s9pk)

### Key Components
1. **main.ts**: Application entry point, initializes services and StartOS integration
2. **interfaces.ts**: Defines StartOS interfaces and data structures
3. **actions/**: Each action corresponds to a StartOS UI action:
   - configure-router.ts: Handles router configuration (bandwidth, floodfill, etc.)
   - reseed-router.ts: Manages router reseeding from bootstrap servers
4. **plugin/**: Implements url-v0 plugin for dynamic service tunnel creation
5. **manifest/index.ts**: Contains package metadata and current version tracking
6. **versions/**: Directory containing version-specific i2pd configuration files

### Configuration Flow
1. StartOS actions modify structured data in memory
2. Data is serialized to i2pd.conf and tunnels.conf with embedded metadata
3. Configuration files are stored in /var/lib/i2pd volume
4. i2pd reads these files on startup/reload

### Build Process
1. TypeScript compiled to JavaScript in javascript/ directory
2. s9pk.mk defines packaging logic for StartOS
3. make command packages JS files, node_modules, and metadata into .s9pk
4. Resulting packages architecture-specific: i2p_<arch>.s9pk

## Common Tasks

### Adding New i2pd Version
1. Update ARG I2PD_VERSION in Dockerfile
2. Update Alpine edge digest using: `docker pull alpine:edge && docker inspect alpine:edge --format '{{index .RepoDigests 0}}'`
3. Create new version file in startos/versions/
4. Update current version in startos/versions/index.ts

### Modifying Router Configuration
Changes should be made in:
- startos/actions/configure-router.ts (action handler)
- startos/main.ts (where configuration is applied to i2pd)
- Data model updates in startos/fileModels/ if needed

### Adding New Service Tunnel Support
1. Modify startos/plugin/ to handle new service types
2. Update URL plugin logic for service detection
3. Ensure proper key storage under /var/lib/i2pd/tunnels/

## Testing
The project currently focuses on manual verification through:
- Building and installing packages
- Testing StartOS action execution
- Verifying configuration file generation
- Checking network connectivity and proxy functionality

## Important Notes
- Base image is Alpine Linux edge with upstream i2pd package (no custom patches)
- All configuration managed through StartOS actions, no direct config file editing
- SOCKS/HTTP proxies only work for .b32.i2p addresses (I2P-network-only)
- Bootstrap time is 3-10 minutes for full network integration
- HTTP API for health checks only on 127.0.0.1:7070
- Configurations are written to /etc/i2pd/ (outside volume mount) to prevent shadowing