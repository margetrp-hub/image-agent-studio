# Upstream Isolation Rules

Image Agent Studio should remain stable when Sub2API, NewAPI, CPA Image, Codex2API, or another OpenAI-compatible gateway changes. The workstation owns the creative workflow; upstream-specific behavior belongs in adapters, deployment config, or smoke tests.

Name ownership is tracked separately in [Naming Lines](../NAMING-LINES.md). Use that document before renaming products, compatibility wrappers, deployment paths, storage keys, or the Codex canvas plugin.

## Boundary

The main workstation UI may ask for:

- provider id
- capability flags
- model slots
- normalized image parameters
- generation/edit/video dispatch plans
- model sync result

The main workstation UI must not own:

- provider-specific route rewrites
- provider-specific retry rules
- provider-specific error codes
- provider-specific model mapping
- provider-specific auth headers
- plugin-only canvas/MCP/tldraw code

## Where Changes Go

- Provider registry: `src/studio/providers/registry.js`
- Dispatch and adapter planning: `src/studio/providers/dispatch.js`, `src/studio/providers/adapters.js`
- Model sync and model classification: `src/studio/generation/modelSync.js`
- Generation route labels and server job payloads: `src/studio/generation/executor.js`
- Gateway HTTP compatibility: `src/aiGatewayClient.js`
- Browser runtime client factories: `src/studio/runtime/clients.js`
- Server environment compatibility: `scripts/studio-service/config.js`
- Server queue and persistence entry: `scripts/image-agent-studio-history-service.mjs`
- Codex plugin canvas work: separate `image-agent-canvas` plugin repo

## Required Checks

Run these after changing an adapter or provider:

```bash
npm run check:boundaries
npm run check:providers
npm run check:generation-executor
npm run check:service-config
npm run check:studio-build
npm run smoke:image:route
npm run smoke:image:edit-route
npm run smoke:newapi:route
npm run smoke:video:route
```

`check:boundaries` blocks common regressions:

- tldraw / MCP plugin code entering the workstation repo
- provider ids being hard-coded in UI components
- provider endpoints being hard-coded in UI components
- gateway/history clients being constructed directly inside `studio.jsx`
- settings UI owning registry ordering
- model sync being reimplemented inside `studio.jsx`
- server job fingerprint/payload construction returning to `studio.jsx`

`check:generation-executor` locks the route and payload contract for queued image jobs.
`check:service-config` locks deployment compatibility aliases such as `SUB2API_BASE_URL` while keeping the main service entry provider-neutral.

## Adding a New Upstream

1. Add a provider descriptor in `src/studio/providers/registry.js`.
2. Add route behavior in `dispatch.js` only if the provider does not match the existing OpenAI-compatible routes.
3. Keep custom auth, headers, model mapping, and retry semantics inside adapter/client code.
4. Add a smoke test if the provider has a unique route, queue, or video task shape.
5. Document the provider under `docs/adapters/`.

Do not add provider-specific branches to `studio.jsx` or UI components. If the UI needs a new control, expose it as a provider capability or model slot first.
