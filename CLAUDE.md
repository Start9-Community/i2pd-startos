## How the upstream version is pulled
- Tor is installed via `apk add tor` in the `Dockerfile` (Alpine package)
- Version depends on what Alpine 3.21 ships — update the Alpine base image to get a newer Tor version

> Upstream is on GitLab. Version is controlled by the Alpine base image, not pinned directly.
