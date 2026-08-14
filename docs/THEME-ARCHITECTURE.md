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

- Web/Desktop: React 19 + Vite, CSS custom properties, and source-owned components.
- Mini Program: native WXSS components or a small TDesign adapter.
- Android: Jetpack Compose + Material 3 theme mapping.

## Web Component Stack

The Web and Electron renderer use the shadcn/ui ownership model without adopting a page template or requiring a full Tailwind rewrite. Components live in this repository and use Image Agent Studio tokens.

- Radix UI supplies behavior-heavy primitives such as dialog, switch, focus management, and keyboard navigation.
- TanStack Query is the preferred server-state layer as the new workstation replaces effect-driven API loading.
- TanStack Table is reserved for administrator tables that need sorting, pagination, and server-side filtering.
- `lucide-react` remains the icon language.

Go does not render UI. It owns authentication, projects, assets, provider connections, jobs, events, and persistence behind Studio API contracts. React owns presentation, local interaction, and non-secret preferences. Provider-specific URLs, credentials, and payload rules stay outside UI components.

```text
React / Electron renderer
  -> Studio API contracts
     -> Go domain and repositories
        -> provider adapters and durable jobs
```

The first shared Web primitives live under `src/ui/`. `packages/theme/web.css` maps the shared theme contract to CSS variables for Web and Desktop only.

## Runtime Choices

The UI stack and the Go service are separate decisions:

| Surface | Runtime | UI layer | Current decision |
| --- | --- | --- | --- |
| Web workstation | Browser | React + source-owned primitives | Primary client |
| Administrator console | Browser | Same primitives + focused data views | Shares the Web design system |
| Desktop | Electron today | Same Web build | Keep until Go execution and persistence reach parity |
| Desktop target | Wails candidate | Same Web build inside the system WebView | Evaluate after the Go cutover gate, not before |
| Mini Program | Taro/React or native pages | Platform components mapped to shared tokens | Lightweight companion only |
| Android | Native Android | Jetpack Compose + Material 3 mapping | Mobile creation and review surface |

Wails can reduce the long-term desktop runtime footprint and bind Go methods directly, but replacing Electron now would couple a UI migration to an unfinished service migration. The desktop shell changes only after the Go server owns durable jobs, image edit/video execution, database persistence, migration, backup, and rollback validation.

## Delivery Plan

1. Foundation: stabilize semantic tokens, source-owned primitives, focus states, dark mode, and motion rules.
2. Account surfaces: migrate login, registration, administrator settings, users, and billing feedback.
3. Generation controls: migrate provider settings, model selection, generation confirmation, and task status.
4. Workstation core: migrate composer, references, prompt panel, queue, gallery, and canvas chrome in isolated slices.
5. Server state: introduce TanStack Query only when a migrated view needs cache invalidation, retries, or polling.
6. Desktop gate: compare Electron and Wails packages after Go reaches runtime parity, then migrate the shell without changing React screens.

Each slice must pass its contract checks, production build, keyboard interaction check, and desktop/mobile browser screenshots before the old CSS for that slice is removed.

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
- Do not use an administrator template as the workstation shell.
- Do not import Web component code into Go, Mini Program, or Android clients.
- Do not introduce TanStack or another dependency until the target view needs the behavior it supplies.

## Migration Path

1. Keep the existing Web CSS working while tokens and shared primitives stabilize.
2. Migrate login, registration, administrator settings, and dialogs.
3. Migrate provider settings and generation confirmation.
4. Migrate composer, queue status, reference panel, and gallery as separate verified slices.
5. Move server state to TanStack Query and complex administrator tables to TanStack Table only when needed.
6. Retire redundant CSS slices after browser regression checks, one surface at a time.
7. Add Mini Program and Android mappings only with their first real screens.

The current large workstation stylesheet is migration debt. It is not a reason for a one-shot rewrite.

## Verification

Use:

```bash
npm run check:theme
npm run check:ui
npm run build
```

These checks validate the shared token groups, Web mapping, local primitive boundary, and production build.
