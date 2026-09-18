export type Point = { x: number; y: number };

/** Cubic dependency curve plus a short tangent segment used for the arrowhead. */
export function dependencyCurve(from: Point, to: Point) {
  const control1 = { x: from.x + 22, y: from.y };
  const control2 = { x: to.x - 22, y: to.y };
  const midpoint = {
    x: (from.x + 3 * control1.x + 3 * control2.x + to.x) / 8,
    y: (from.y + 3 * control1.y + 3 * control2.y + to.y) / 8,
  };
  const dx = 3 * ((control1.x - from.x) + 2 * (control2.x - control1.x) + (to.x - control2.x)) / 4;
  const dy = 3 * ((control1.y - from.y) + 2 * (control2.y - control1.y) + (to.y - control2.y)) / 4;
  const length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length;
  return {
    path: `M${from.x},${from.y} C${control1.x},${control1.y} ${control2.x},${control2.y} ${to.x},${to.y}`,
    arrowStart: { x: midpoint.x - ux * 5, y: midpoint.y - uy * 5 },
    arrowEnd: { x: midpoint.x + ux * 5, y: midpoint.y + uy * 5 },
  };
}
