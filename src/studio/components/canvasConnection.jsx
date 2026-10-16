import { memo } from 'react';
import { canvasEdgeGeometry } from '../util/canvasGeometry.js';
import { CANVAS_PLANE_HEIGHT, CANVAS_PLANE_WIDTH } from '../util/canvasConstants.js';

// Camera movement changes the plane transform, not individual edge geometry.
export const CanvasConnection = memo(function CanvasConnection({ from, to, type, lineageClass, performanceMode }) {
  const { path, jointX, jointY } = canvasEdgeGeometry(from, to, CANVAS_PLANE_WIDTH, CANVAS_PLANE_HEIGHT);
  const active = lineageClass.includes('active');
  return (
    <g className={`canvasLinkGroup ${lineageClass} ${type === 'custom' ? 'custom' : 'lineage'}`}>
      <path className="canvasLinkPath" d={path} markerEnd={active ? 'url(#canvasLinkArrowActive)' : 'url(#canvasLinkArrow)'} />
      <circle className="canvasLinkJoint" cx={jointX} cy={jointY} r="2.4" />
      {active && !performanceMode ? (
        <text className="canvasLinkLabel" x={jointX + 12} y={jointY - 10}>{`#${from.canvasIndex || ''} -> #${to.canvasIndex || ''}`}</text>
      ) : null}
    </g>
  );
});
