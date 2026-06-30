// Helpers for the reference-image rail. Keeps the file-type allowlist and the
// reference-item factory in one place so the upload paths (drag-drop, file
// picker, paste) stay consistent.

export const IMAGE_REFERENCE_LIMIT = 4;

// Frozen Set so callers can't accidentally mutate the allowlist at runtime.
export const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function filePreviewUrl(file) {
  return file ? URL.createObjectURL(file) : '';
}

// Filters arbitrary `File`/`FileList` input down to the supported image types
// and clips the count to the rail's capacity. The default `limit` mirrors
// IMAGE_REFERENCE_LIMIT so callers rarely need to override it.
export function supportedReferenceFiles(files, limit = IMAGE_REFERENCE_LIMIT) {
  return Array.from(files || [])
    .filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type))
    .slice(0, limit);
}

// Creates a reference-rail item with a stable-enough id. We don't need crypto
// uniqueness — the id only has to disambiguate items inside the current
// session's queue.
export function createReferenceItem(file, role = 'identity') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    role
  };
}
