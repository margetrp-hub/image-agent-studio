# Apps Directory

`apps/` is the v1 home for runtime application boundaries.

The first migration step only documents the intended split. Existing production code may still live under `src/`, `scripts/`, and root deployment files until each boundary can be moved with tests and compatibility wrappers.

## Boundaries

```text
apps/
  web/       Browser workstation.
  server/    Studio API, queue runner, provider dispatch, and asset storage.
```

## Ownership Rules

- `apps/web` owns user interaction, local UI state, canvas behavior, and browser cache.
- `apps/server` owns durable state, authenticated Studio API routes, provider dispatch, queues, and protected assets.
- Shared contracts should be small and explicit: provider capability descriptors, job status names, route names, and serializable data shapes.
- Raw provider credentials must not cross into durable browser storage, history records, job records, assets, or backups.

## Compatibility

The v1 directory names are product-neutral. Legacy names such as `sub2api`, `history service`, and `image-sub2api-studio` can remain in wrappers, environment aliases, data directories, and Docker service names while existing installs migrate.
