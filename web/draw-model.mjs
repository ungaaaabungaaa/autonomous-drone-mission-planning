const pointOK = (point) =>
  Array.isArray(point) &&
  point.length === 2 &&
  point.every(Number.isFinite) &&
  Math.abs(point[0]) <= 180 &&
  Math.abs(point[1]) <= 80;
export function closeRing(points) {
  if (
    !Array.isArray(points) ||
    points.length > 1000 ||
    points.some((point) => !pointOK(point))
  )
    throw new Error("Use at most 1000 finite longitude/latitude vertices.");
  const open = points.map((point) => [...point]);
  if (
    open.length > 1 &&
    open[0][0] === open.at(-1)[0] &&
    open[0][1] === open.at(-1)[1]
  )
    open.pop();
  if (new Set(open.map((point) => point.join(","))).size < 3)
    throw new Error("A ring needs at least three distinct vertices.");
  return [...open, [...open[0]]];
}
export function withRing(feature, points, hole) {
  const ring = closeRing(points);
  if (hole && feature?.geometry?.type !== "Polygon")
    throw new Error("Draw an outer boundary before an exclusion.");
  return {
    type: "Feature",
    properties: { purpose: "Offline survey boundary" },
    geometry: {
      type: "Polygon",
      coordinates: hole
        ? [...structuredClone(feature.geometry.coordinates), ring]
        : [ring],
    },
  };
}
export function viewBounds(feature) {
  if (!feature)
    return {
      minLon: 77.5895,
      maxLon: 77.5925,
      minLat: 12.9695,
      maxLat: 12.9725,
    };
  const points = feature?.geometry?.coordinates?.flat();
  if (
    feature.geometry.type !== "Polygon" ||
    !points?.length ||
    points.length > 1000 ||
    points.some((point) => !pointOK(point))
  )
    throw new Error("A bounded 2D polygon is required for the local grid.");
  const lon = points.map((point) => point[0]),
    lat = points.map((point) => point[1]);
  const minLon = Math.min(...lon),
    maxLon = Math.max(...lon),
    minLat = Math.min(...lat),
    maxLat = Math.max(...lat);
  const dx = Math.max(maxLon - minLon, 0.0001) * 0.14,
    dy = Math.max(maxLat - minLat, 0.0001) * 0.14;
  return {
    minLon: minLon - dx,
    maxLon: maxLon + dx,
    minLat: minLat - dy,
    maxLat: maxLat + dy,
  };
}
export function projection(bounds, width = 1000, height = 700) {
  const { minLon, maxLon, minLat, maxLat } = bounds;
  if (
    ![minLon, maxLon, minLat, maxLat, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    maxLon <= minLon ||
    maxLat <= minLat
  )
    throw new Error("Invalid viewport bounds.");
  const cosine = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const scale = Math.min(
    (width - 64) / ((maxLon - minLon) * cosine),
    (height - 64) / (maxLat - minLat),
  );
  const cx = (minLon + maxLon) / 2,
    cy = (minLat + maxLat) / 2;
  return {
    forward: ([lon, lat]) => [
      width / 2 + (lon - cx) * cosine * scale,
      height / 2 - (lat - cy) * scale,
    ],
    inverse: ([x, y]) => [
      cx + (x - width / 2) / (cosine * scale),
      cy - (y - height / 2) / scale,
    ],
  };
}
