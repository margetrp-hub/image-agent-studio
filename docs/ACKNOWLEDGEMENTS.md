# Acknowledgements and Reference Boundaries

Image Agent Studio is an independent front-end workstation for OpenAI-compatible image generation and editing gateways.

The project was informed by community prompt examples, public AI creation workflows, and open-source frontend tooling. These references helped with product thinking, prompt template design, and implementation choices. They do not imply affiliation, sponsorship, code ownership, asset ownership, or that this repository is a fork of those projects.

## What This Project Owns

- The creation workflow in `studio.html` and `src/studio.jsx`.
- The image and video workspace UI, parameter controls, reference upload flow, masked key display, and history panel.
- The OpenAI-compatible gateway client glue in `src/aiGatewayClient.js`.
- The optional per-user history service in `scripts/image-agent-studio-history-service.mjs`.
- The deployment examples under `deploy/`, Docker, and Nginx documentation.
- The screenshots under `docs/screenshots/`, which show this project's own UI.

## Prompt Template References

Community prompt projects and public prompt examples are used as prompt-source references and learning material only.

Prompt template content in `docs/templates.md`, `public/cases.json`, and future template data should be treated as community prompt material under `CC BY 4.0` where applicable. Keep attribution to the original author or source when using, adapting, or redistributing those templates.

Current explicit prompt-source reference:

- [`signature-image-prompts-gpt-image-2.md`](https://github.com/zaizhi-1112/ai-image-extension-playbook/blob/main/signature-image-prompts-gpt-image-2.md) / [@liyue_ai](https://x.com/liyue_ai), referenced as prompt-template learning material.

When adding more prompt sources, add source metadata such as:

```json
{
  "sourceName": "Original source name",
  "sourceUrl": "https://example.com/source",
  "license": "CC-BY-4.0",
  "usage": "Prompt template reference only",
  "includesAssets": false
}
```

## Product and Workflow References

Public AI image tools, prompt galleries, and creator workbench products were reviewed as product and workflow references. Typical reference areas include prompt editing, parameter controls, inspiration cards, history, output preview, and protected asset libraries.

No third-party product UI screenshots, private images, brand assets, or proprietary interface files are included as project assets.

Recent UI and configuration references reviewed as public learning material:

- [`basketikun/infinite-canvas`](https://github.com/basketikun/infinite-canvas), reviewed for canvas nodes, links, hover tools, zoom controls, and canvas-side configuration patterns.
- [`codegrazier/cpa-image`](https://github.com/codegrazier/cpa-image), reviewed for compact settings, local-first task panels, queue states, and explicit connection/model-sync actions.

## Open-Source Dependencies

The application is built with React, Vite, and Lucide React. Their licenses are governed by their own package metadata and upstream repositories.

Deployment examples use common Docker and Nginx patterns. Those examples are integration recipes, not bundled third-party services.

## Image and Static Asset Boundary

The open-source repository intentionally does not include a full reference image library.

- Public demo assets should only contain images that are generated or cleared for redistribution.
- Third-party project images, README screenshots, covers, thumbnails, or private reference images should not be copied into this repository or a public static package unless their asset license explicitly allows redistribution.
- AI-generated images can still have platform-term, personality-right, trademark, or character/IP considerations. Avoid public demo images containing recognizable brands, celebrities, copyrighted characters, watermarks, or unclear source material.
- Private production libraries should be served from a server, object storage, or CDN and loaded after authentication when needed.

## Source Registry Rule

If a template, case, prompt pack, or demo asset is added later, include source metadata close to the data. Use `public/inspiration-sources.json` as the lightweight source registry for starter data, or keep a private registry beside a private library package.
