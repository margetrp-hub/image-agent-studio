// Persists which workbench panels are open/folded so the user's last layout is
// restored on reload. The composer parameter editor is intentionally session-only:
// generation settings are reviewed from the generate confirmation dialog, not
// restored as a large panel on every visit.

const WORKBENCH_LAYOUT_KEY = 'image-sub2api-studio:workbench-layout:v6';
const LEGACY_WORKBENCH_LAYOUT_KEYS = [
  'image-sub2api-studio:workbench-layout:v5'
];

const DEFAULT_LAYOUT = Object.freeze({
  prompt: false,
  references: true,
  parameters: true,
  parametersRail: false,
  bottomComposer: true,
  composerParameters: false,
  composerFolded: false
});

export function loadWorkbenchLayout() {
  try {
    const raw = localStorage.getItem(WORKBENCH_LAYOUT_KEY)
      || LEGACY_WORKBENCH_LAYOUT_KEYS.map((key) => localStorage.getItem(key)).find(Boolean)
      || 'null';
    const stored = JSON.parse(raw);
    return {
      prompt: stored?.prompt === true,
      references: stored?.references !== false,
      parameters: stored?.parameters !== false,
      parametersRail: stored?.parametersRail === true,
      bottomComposer: stored?.bottomComposer !== false,
      composerParameters: false,
      composerFolded: stored?.composerFolded === true
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveWorkbenchLayout(layout) {
  try {
    localStorage.setItem(WORKBENCH_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Layout state is optional; keep the in-memory UI responsive even if storage fails.
  }
}
