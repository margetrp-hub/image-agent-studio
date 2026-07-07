# Theme Architecture

Image Agent Studio can use `创作工作台` as the Chinese product descriptor. The repository and release identity remain `Image Agent Studio` / `image-agent-studio`.

The theme architecture should support four client surfaces:

- Web workstation.
- Desktop wrapper.
- Mini Program companion.
- Android client.

## Decision

Use shared semantic design tokens instead of sharing CSS files across clients.

The source of truth is:

```text
packages/theme/tokens.json
```

Each client maps those tokens into its own platform styling layer:

- Web/Desktop: CSS custom properties.
- Mini Program: WXSS variables or generated constants.
- Android: Material/Compose theme values.

## Why This Changes Now

The current web UI has many large CSS slices tuned for one browser surface. That was acceptable while the product was a single web workstation. Once Mini Program and Android clients exist, copying those styles would create three different visual systems and make later UI fixes unpredictable.

The shared theme layer should define the intent:

- app background
- canvas background
- surface and raised surfaces
- primary, secondary, muted, and inverse text
- default, subtle, and strong borders
- primary, secondary, and warm accents
- success, warning, danger, and info states
- common radius, spacing, stroke, typography, and motion

Platform code decides the exact component implementation.

## Rules

- Do not import web CSS into Mini Program or Android.
- Do not use provider names as theme names.
- Do not create one theme per upstream gateway.
- Do not encode product mode names into raw colors.
- Keep light and dark mode token-compatible.
- Keep density adjustments as client-level mapping, not new token names.

## Migration Path

1. Keep the existing web CSS working.
2. Introduce CSS variables generated or copied from `packages/theme/tokens.json`.
3. Move repeated colors, radius, strokes, and spacing to semantic variables.
4. Add Mini Program and Android mapping files only after their first screens exist.
5. Treat old hard-coded values as migration debt, not as a second theme system.

## Verification

Use:

```bash
npm run check:theme
```

This check validates that the shared token file keeps required modes, semantic color groups, spacing, radius, stroke, typography, motion, and product aliases.
