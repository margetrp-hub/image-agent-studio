# Provider-Neutral Contracts

`packages/contracts` defines the versioned wire contracts shared by Studio clients and services. It has no runtime or development dependencies.

## Contract Set

- `Project`, `Scene`, and `Shot` describe normalized creative structure.
- `Asset` describes stored media without prescribing a storage backend.
- `PromptRevision` keeps immutable prompt history separate from shots.
- `GenerationJob` describes provider-independent generation state.
- `LineageEdge` records how assets are related or derived.
- `ProviderConnection` describes an adapter, endpoint, capabilities, and an opaque server-side credential reference.
- `JobEvent` defines queued, started, progress, retry, success, failure, and cancellation events.

All records use `schemaVersion: "1.0"`. JSON Schemas under `schemas/` are the canonical wire definitions. Records are normalized by ID; referential integrity and lifecycle ordering are application or persistence concerns rather than single-document schema concerns.

## Security Boundary

`ProviderConnection.auth` accepts only an authentication type and `credentialRef`. Raw API keys, bearer tokens, OAuth tokens, passwords, and cookies do not belong in this contract. `settings`, `metadata`, and `parameters` must contain non-secret portable values only.

## JavaScript API

```js
import {
  assertContract,
  contractSchemas,
  validateContract,
} from '@image-agent-studio/contracts';

const result = validateContract('GenerationJob', candidate);
if (!result.valid) {
  console.error(result.errors);
}

assertContract('JobEvent', event);
console.log(contractSchemas.Project.$id);
```

The bundled validator implements the JSON Schema keywords used by this package. Consumers that already use a full Draft 2020-12 validator can load the JSON files directly.

## Check

From the repository root:

```powershell
npm --prefix packages/contracts run check
```

The check parses every schema, resolves every `$ref`, verifies the package remains dependency-free, syntax-checks the JavaScript files, accepts all representative valid fixtures, and rejects the invalid fixtures.
