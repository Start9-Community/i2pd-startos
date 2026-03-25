## How the upstream version is pulled

The Dockerfile pins both the Alpine edge digest and the i2pd package version
(`ARG I2PD_VERSION=2.59.0-r1`). This ensures reproducible builds.

A weekly GitHub Actions workflow (`checkUpstream.yml`) compares the pinned
version against Alpine edge and opens a PR when a newer i2pd is available.

### Upgrading i2pd

1. Update `ARG I2PD_VERSION=<new>` in `Dockerfile`
2. Update the `@sha256:` digest: `docker pull alpine:edge && docker inspect alpine:edge --format '{{index .RepoDigests 0}}'`
3. Create a new version file in `startos/versions/`
4. Update `current` in `startos/versions/index.ts`

> Upstream: https://github.com/PurpleI2P/i2pd

### Build

```
make x86_64   # builds i2p_x86_64.s9pk (~10 seconds)
```

