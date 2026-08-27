# Applications

- `playground/` is the Babylon-backed catalog Playground and runtime inspection surface.
- `studio/` is the local Creator Studio and workflow orchestration application. Its
  executable sources live under `studio/src/`; static assets and persisted local data
  remain owned by the application root.

The public architecture publication is not a workspace application. It lives under
`sites/world-sdk-blueprint/` and uses its own npm lockfile and Cloudflare build.
