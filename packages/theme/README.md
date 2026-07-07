# Theme Tokens

`packages/theme` is the shared visual contract for Image Agent Studio clients.

The goal is to keep the web workstation, desktop app, Mini Program client, Android client, and future plugin-adjacent surfaces visually related without coupling them to one CSS file.

## Source Of Truth

- `tokens.json` stores semantic design tokens.
- Platform code maps tokens into CSS variables, WXSS variables, Android resources, or Compose theme values.
- Product components should prefer semantic token names over raw hex colors and one-off spacing.

## Token Layers

- Core primitives: spacing, radius, stroke, type scale, and motion.
- Semantic color: app background, canvas, surface, text, border, accent, status, and overlay.
- Product semantics: composer, canvas link, reference panel, queue, prompt card, and generation status.

## Client Mapping

- Web/Desktop: map tokens to CSS custom properties.
- Mini Program: map tokens to WXSS variables or build-time constants.
- Android: map tokens to Material/Compose color, typography, shape, and motion definitions.

The clients can differ in density and platform idioms, but token names should stay stable.
