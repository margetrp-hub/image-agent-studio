# Frontend v1 Workbench Skeleton

This folder is an isolated React source skeleton for the next Image Agent Studio workbench. It is intentionally not wired into the current `src/studio.jsx` entrypoint.

## Module Boundaries

- `src/app/`: application shell composition and cross-region layout only.
- `src/features/project-rail/`: project/session navigation and workspace status.
- `src/features/canvas-workspace/`: primary generation canvas, queue lanes, and selected result surface.
- `src/features/composer/`: prompt drafting, mode controls, and submit affordances.
- `src/features/reference-rail/`: uploaded/reference assets and influence controls.
- `src/features/inspiration-plaza/`: reusable prompt ideas, style packs, and sample directions.
- `src/data/`: mock workspace state used to make the skeleton inspectable without services.
- `src/styles/`: presentation CSS for the isolated workbench.

## Verification

Run from the repository root:

```sh
npm run check:web-skeleton
```

The command builds only this isolated app with its local Vite config.
