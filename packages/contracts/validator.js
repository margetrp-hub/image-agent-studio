export function validateSchema(schema, value, options = {}) {
  const errors = [];
  const schemaRegistry = options.schemaRegistry || new Map();
  walk(schema, value, '$', schema, schemaRegistry, errors);
  return { valid: errors.length === 0, errors };
}

function walk(schema, value, path, rootSchema, schemaRegistry, errors) {
  if (!schema || typeof schema !== 'object') {
    pushError(errors, path, 'schema', 'schema must be an object');
    return;
  }

  if (schema.$ref) {
    const resolved = resolveReference(schema.$ref, rootSchema, schemaRegistry);
    if (!resolved) {
      pushError(errors, path, '$ref', `cannot resolve ${schema.$ref}`);
      return;
    }
    walk(resolved.schema, value, path, resolved.rootSchema, schemaRegistry, errors);
    return;
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    pushError(errors, path, 'const', `must equal ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
    pushError(errors, path, 'enum', `must be one of ${schema.enum.map(JSON.stringify).join(', ')}`);
  }

  if (schema.allOf) {
    for (const branch of schema.allOf) {
      walk(branch, value, path, rootSchema, schemaRegistry, errors);
    }
  }

  if (schema.oneOf) {
    const branchErrors = schema.oneOf.map((branch) => {
      const candidateErrors = [];
      walk(branch, value, path, rootSchema, schemaRegistry, candidateErrors);
      return candidateErrors;
    });
    const matchCount = branchErrors.filter((candidateErrors) => candidateErrors.length === 0).length;
    if (matchCount !== 1) {
      pushError(errors, path, 'oneOf', `must match exactly one schema branch; matched ${matchCount}`);
    }
  }

  if (schema.if) {
    const conditionErrors = [];
    walk(schema.if, value, path, rootSchema, schemaRegistry, conditionErrors);
    if (conditionErrors.length === 0 && schema.then) {
      walk(schema.then, value, path, rootSchema, schemaRegistry, errors);
    } else if (conditionErrors.length > 0 && schema.else) {
      walk(schema.else, value, path, rootSchema, schemaRegistry, errors);
    }
  }

  if (schema.type && !matchesType(value, schema.type)) {
    pushError(errors, path, 'type', `must be ${schema.type}`);
    return;
  }

  if (typeof value === 'string') {
    validateString(schema, value, path, errors);
  } else if (typeof value === 'number') {
    validateNumber(schema, value, path, errors);
  } else if (Array.isArray(value)) {
    validateArray(schema, value, path, rootSchema, schemaRegistry, errors);
  } else if (value !== null && typeof value === 'object') {
    validateObject(schema, value, path, rootSchema, schemaRegistry, errors);
  }
}

function validateString(schema, value, path, errors) {
  const length = Array.from(value).length;
  if (schema.minLength !== undefined && length < schema.minLength) {
    pushError(errors, path, 'minLength', `must contain at least ${schema.minLength} characters`);
  }
  if (schema.maxLength !== undefined && length > schema.maxLength) {
    pushError(errors, path, 'maxLength', `must contain at most ${schema.maxLength} characters`);
  }
  if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
    pushError(errors, path, 'pattern', `must match ${schema.pattern}`);
  }
  if (schema.format === 'date-time' && !isDateTime(value)) {
    pushError(errors, path, 'format', 'must be an RFC 3339 date-time');
  }
  if (schema.format === 'uri' && !isAbsoluteUri(value)) {
    pushError(errors, path, 'format', 'must be an absolute URI');
  }
}

function validateNumber(schema, value, path, errors) {
  if (!Number.isFinite(value)) {
    pushError(errors, path, 'type', 'must be a finite number');
    return;
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    pushError(errors, path, 'minimum', `must be at least ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    pushError(errors, path, 'maximum', `must be at most ${schema.maximum}`);
  }
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    pushError(errors, path, 'exclusiveMinimum', `must be greater than ${schema.exclusiveMinimum}`);
  }
}

function validateArray(schema, value, path, rootSchema, schemaRegistry, errors) {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    pushError(errors, path, 'minItems', `must contain at least ${schema.minItems} items`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    pushError(errors, path, 'maxItems', `must contain at most ${schema.maxItems} items`);
  }
  if (schema.uniqueItems) {
    const unique = new Set(value.map((item) => JSON.stringify(item)));
    if (unique.size !== value.length) {
      pushError(errors, path, 'uniqueItems', 'must not contain duplicate items');
    }
  }
  if (schema.items) {
    value.forEach((item, index) => {
      walk(schema.items, item, `${path}[${index}]`, rootSchema, schemaRegistry, errors);
    });
  }
}

function validateObject(schema, value, path, rootSchema, schemaRegistry, errors) {
  const properties = schema.properties || {};
  for (const requiredName of schema.required || []) {
    if (!Object.hasOwn(value, requiredName)) {
      pushError(errors, `${path}.${requiredName}`, 'required', 'is required');
    }
  }
  for (const [name, propertySchema] of Object.entries(properties)) {
    if (Object.hasOwn(value, name)) {
      walk(propertySchema, value[name], `${path}.${name}`, rootSchema, schemaRegistry, errors);
    }
  }
  if (schema.additionalProperties === false) {
    for (const name of Object.keys(value)) {
      if (!Object.hasOwn(properties, name)) {
        pushError(errors, `${path}.${name}`, 'additionalProperties', 'is not allowed');
      }
    }
  }
}

function resolveReference(reference, rootSchema, schemaRegistry) {
  const [documentReference, fragment = ''] = reference.split('#', 2);
  const targetRoot = documentReference ? schemaRegistry.get(documentReference) : rootSchema;
  if (!targetRoot) {
    return null;
  }
  const schema = resolvePointer(targetRoot, fragment);
  return schema ? { schema, rootSchema: targetRoot } : null;
}

function resolvePointer(document, fragment) {
  if (!fragment) {
    return document;
  }
  if (!fragment.startsWith('/')) {
    return null;
  }
  return fragment
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((current, part) => current?.[part], document);
}

function matchesType(value, type) {
  switch (type) {
    case 'array':
      return Array.isArray(value);
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return typeof value === type;
  }
}

function isDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isAbsoluteUri(value) {
  try {
    return Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pushError(errors, path, keyword, message) {
  errors.push({ path, keyword, message });
}
