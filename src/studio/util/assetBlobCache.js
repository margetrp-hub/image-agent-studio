// Keep an LRU of completed media, bounded by bytes as well as entry count.
// In-flight requests belong to the caller so eviction cannot duplicate them.
export function createAssetBlobCache({ maxEntries = 80, maxBytes = 64 * 1024 * 1024 } = {}) {
  const entries = new Map();
  let bytes = 0;
  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    bytes -= entry.size;
    entries.delete(key);
  }
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry;
    },
    set(key, blob) {
      remove(key);
      if (blob.size > maxBytes) return;
      entries.set(key, blob);
      bytes += blob.size;
      while (entries.size > maxEntries || bytes > maxBytes) remove(entries.keys().next().value);
    },
    get size() { return entries.size; },
    get bytes() { return bytes; }
  };
}
