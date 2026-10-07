// Geometry in the level's local planar metres (invariant 2). Every venue keeps its
// source's frame: x east, y south, origin at the site's north-west corner.
'use strict';

const round = (v) => Math.round(v * 1000) / 1000;

function rectPolygon([x1, y1, x2, y2]) {
  return { type: 'Polygon', coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]].map((p) => p.map(round))] };
}

function pointsPolygon(points) {
  const ring = points.map((p) => p.map(round));
  const [f, l] = [ring[0], ring[ring.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f);
  return { type: 'Polygon', coordinates: [ring] };
}

function lineString(a, b) {
  return { type: 'LineString', coordinates: [a.map(round), b.map(round)] };
}

/** BOX parameters (centre, width, depth) of an axis-aligned rect. */
function rectBox([x1, y1, x2, y2]) {
  return { cx: round((x1 + x2) / 2), cy: round((y1 + y2) / 2), w: round(Math.abs(x2 - x1)), d: round(Math.abs(y2 - y1)) };
}

/** A box of the given width around the segment a-b (a corridor or a bridge). */
function segmentBox(a, b, width) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const hw = len / 2;
  const hd = width / 2;
  const r = (deg * Math.PI) / 180;
  const corner = (u, v) => [cx + u * Math.cos(r) - v * Math.sin(r), cy + u * Math.sin(r) + v * Math.cos(r)];
  const ring = [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)];
  return { cx: round(cx), cy: round(cy), w: round(len), d: round(width), rot: round(deg), geo: pointsPolygon(ring) };
}

/** A door of width w at point p on the edge of rect: a segment along that edge. */
function doorOnRect(rect, p, w) {
  const [x1, y1, x2, y2] = rect;
  const dist = [Math.abs(p[1] - y1), Math.abs(p[1] - y2), Math.abs(p[0] - x1), Math.abs(p[0] - x2)];
  const horizontal = Math.min(dist[0], dist[1]) <= Math.min(dist[2], dist[3]);
  return horizontal ? lineString([p[0] - w / 2, p[1]], [p[0] + w / 2, p[1]]) : lineString([p[0], p[1] - w / 2], [p[0], p[1] + w / 2]);
}

const contains = ([x1, y1, x2, y2], [x, y]) => x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2);
const area = ([x1, y1, x2, y2]) => Math.abs(x2 - x1) * Math.abs(y2 - y1);

module.exports = { round, rectPolygon, pointsPolygon, lineString, rectBox, segmentBox, doorOnRect, contains, area };
