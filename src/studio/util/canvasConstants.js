// Canvas plane / node geometry constants shared between studio.jsx, the
// canvas hooks, and the geometry helpers. Centralized here so a refactor
// that moves one consumer doesn't leave the others referencing stale inline
// copies.

export const CANVAS_PLANE_WIDTH = 6000;
export const CANVAS_PLANE_HEIGHT = 4200;
export const CANVAS_NODE_WIDTH = 340;
export const CANVAS_NODE_HEIGHT = 280;
export const CANVAS_NODE_MIN_WIDTH = 240;
export const CANVAS_NODE_MIN_HEIGHT = 200;
export const CANVAS_NODE_MAX_WIDTH = 1280;
export const CANVAS_NODE_MAX_HEIGHT = 960;
export const CANVAS_NODE_HORIZONTAL_GAP = 170;
export const CANVAS_NODE_VERTICAL_GAP = 88;
export const CANVAS_DRAG_CLICK_TOLERANCE = 4;
export const CANVAS_VIRTUALIZATION_MARGIN = 420;
export const CANVAS_PERFORMANCE_NODE_THRESHOLD = 18;
export const CANVAS_PERFORMANCE_EDGE_THRESHOLD = 24;
export const CANVAS_PROTECTED_ASSET_RESOLVE_LIMIT = 24;
