// Persists which template/inspiration cards the user has marked as favorites.
// Stored as a JSON array of identifiers; loaded back into a Set for O(1) lookup
// in the gallery rail.

const TEMPLATE_FAVORITES_KEY = 'image-sub2api-studio:template-favorites:v1';
const LEGACY_TEMPLATE_FAVORITES_KEY = 'ohlaoo-studio:template-favorites:v1';

export function loadTemplateFavorites() {
  try {
    const items = JSON.parse(
      localStorage.getItem(TEMPLATE_FAVORITES_KEY)
        || localStorage.getItem(LEGACY_TEMPLATE_FAVORITES_KEY)
        || '[]'
    );
    return new Set(Array.isArray(items) ? items.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveTemplateFavorites(favorites) {
  try {
    localStorage.setItem(TEMPLATE_FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Favorite state is a convenience layer; Studio still works if storage is unavailable.
  }
}
