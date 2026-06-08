export function providerParameterList(provider, key, fallback = []) {
  const values = provider?.parameters?.[key];
  return Array.isArray(values) && values.length ? values : fallback;
}

export function providerCountRange(provider, fallback = [1, 10]) {
  const [fallbackMin, fallbackMax] = fallback;
  const [minValue, maxValue] = Array.isArray(provider?.parameters?.countRange)
    ? provider.parameters.countRange
    : [fallbackMin, fallbackMax];
  const min = Math.max(1, Math.round(Number(minValue) || fallbackMin || 1));
  const max = Math.max(min, Math.round(Number(maxValue) || fallbackMax || min));
  return { min, max };
}

export function providerAspectOptions(provider, aspectOptions, sizeOptions) {
  const supportedSizes = new Set(providerParameterList(provider, 'sizes', sizeOptions));
  const options = aspectOptions.filter((item) => item.value === 'custom' || supportedSizes.has(item.size));
  return options.length ? options : aspectOptions;
}

export function providerCustomSizeOptions(provider, customSizeOptions, sizeOptions) {
  const sizes = providerParameterList(provider, 'sizes', sizeOptions);
  return sizes.map((value) => (
    customSizeOptions.find((item) => item.value === value) || {
      value,
      label: value === 'auto' ? 'Auto' : value.replace('x', ' x ')
    }
  ));
}

export function clampCountForProvider(value, provider, normalizeCount, fallbackRange = [1, 10]) {
  const range = providerCountRange(provider, fallbackRange);
  const next = normalizeCount(value);
  return Math.min(range.max, Math.max(range.min, next));
}
