# Apps Directory

`apps/` is the v1 home for runtime application boundaries.

The first migration step only documents the intended split. Existing production code may still live under `src/`, `scripts/`, and root deployment files until each boundary can be moved with tests and compatibility wrappers.

## Boundaries

```text
apps/
  web/       Browser workstation.
  desktop/   Electron desktop wrapper.
  miniapp/   Mini Program companion client.
  android/   Android companion client.
  server/    Studio API, queue runner, provider dispatch, and asset storage.
  server-go/ Gradual Go core for users, provider links, queue, dispatch, and assets.
```

## Ownership Rules

- `apps/web` owns user interaction, local UI state, canvas behavior, and browser cache.
- `apps/desktop` owns desktop packaging and local runtime startup around the web workstation.
- `apps/miniapp` owns lightweight mobile prompt, inspiration, reference, and history workflows.
- `apps/android` owns native mobile capture, review, sharing, and lightweight continuation workflows.
- `apps/server` owns durable state, authenticated Studio API routes, provider dispatch, queues, and protected assets.
- `apps/server-go` is the gradual Go replacement for the durable service core. It starts with first-party users and backend provider links before taking over queue, dispatch, assets, backup, and restore.
- Shared contracts should be small and explicit: provider capability descriptors, job status names, route names, and serializable data shapes.
- Raw provider credentials must not cross into durable browser storage, history records, job records, assets, or backups.
- Shared theme tokens live under `packages/theme`; clients map those tokens into platform-native styling instead of copying CSS between surfaces.

## Compatibility

The v1 directory names are product-neutral. Legacy names such as `sub2api`, `history service`, and `image-sub2api-studio` can remain in wrappers, environment aliases, data directories, and Docker service names while existing installs migrate.

For the full product, plugin, provider, legacy, deployment, and storage naming policy, see [Naming Lines](../docs/NAMING-LINES.md).

For multi-client boundaries and theme direction, see [Multi-client Architecture](../docs/MULTI-CLIENT-ARCHITECTURE.md) and [Theme Architecture](../docs/THEME-ARCHITECTURE.md).
