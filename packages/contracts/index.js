import { validateSchema } from './validator.js';
import assetSchema from './schemas/asset.schema.json' with { type: 'json' };
import commonSchema from './schemas/common.schema.json' with { type: 'json' };
import generationJobSchema from './schemas/generation-job.schema.json' with { type: 'json' };
import jobEventSchema from './schemas/job-event.schema.json' with { type: 'json' };
import lineageEdgeSchema from './schemas/lineage-edge.schema.json' with { type: 'json' };
import projectSchema from './schemas/project.schema.json' with { type: 'json' };
import promptRevisionSchema from './schemas/prompt-revision.schema.json' with { type: 'json' };
import providerConnectionSchema from './schemas/provider-connection.schema.json' with { type: 'json' };
import sceneSchema from './schemas/scene.schema.json' with { type: 'json' };
import shotSchema from './schemas/shot.schema.json' with { type: 'json' };

export const CONTRACT_VERSION = '1.0';

const schemaEntries = Object.freeze({
  Project: ['project.schema.json', projectSchema],
  Scene: ['scene.schema.json', sceneSchema],
  Shot: ['shot.schema.json', shotSchema],
  Asset: ['asset.schema.json', assetSchema],
  PromptRevision: ['prompt-revision.schema.json', promptRevisionSchema],
  GenerationJob: ['generation-job.schema.json', generationJobSchema],
  LineageEdge: ['lineage-edge.schema.json', lineageEdgeSchema],
  ProviderConnection: ['provider-connection.schema.json', providerConnectionSchema],
  JobEvent: ['job-event.schema.json', jobEventSchema],
});

export const contractSchemas = Object.freeze(
  Object.fromEntries(Object.entries(schemaEntries).map(([name, [, schema]]) => [name, schema])),
);

const schemaRegistry = new Map([
  ['common.schema.json', commonSchema],
  [commonSchema.$id, commonSchema],
]);

for (const [name, schema] of Object.entries(contractSchemas)) {
  schemaRegistry.set(schemaEntries[name][0], schema);
  schemaRegistry.set(schema.$id, schema);
}

export function getContractSchema(name) {
  const schema = contractSchemas[name];
  if (!schema) {
    throw new TypeError(`Unknown contract schema: ${name}`);
  }
  return schema;
}

export function validateContract(name, value) {
  return validateSchema(getContractSchema(name), value, { schemaRegistry });
}

export function assertContract(name, value) {
  const result = validateContract(name, value);
  if (!result.valid) {
    const detail = result.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join('; ');
    throw new TypeError(`${name} contract validation failed: ${detail}`);
  }
  return value;
}
