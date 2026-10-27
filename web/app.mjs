import { createSurvey } from "./src/planner.js";
import { parseBoundedJson } from "./src/validation.js";
import { buildArtifacts } from "./src/wpl.js";
import { withRing, viewBounds, projection } from "./draw-model.mjs";
const $ = (id) => document.getElementById(id);
const fields = [
  "cameraAglM",
  "relativeHomeAltitudeM",
  "horizontalFovDeg",
  "verticalFovDeg",
  "sideOverlap",
  "frontOverlap",
  "speedMps",
  "batteryMinutes",
  "reservePercent",
];
const exports = ["download-report", "download-geojson", "download-wpl"];
let boundary = null,
  report = null,
  snapshot = null,
  bounds = viewBounds(null),
  drawing = null;
const text = (id, value) => {
  $(id).textContent = value;
};
function status(message, error = false) {
  text("status", message);
  $("status").classList.toggle("error", error);
}
function invalidate(
  message = "Inputs changed. Generate the survey to update the route.",
) {
  report = null;
  snapshot = null;
  exports.forEach((id) => ($(id).disabled = true));
  ["distance", "duration", "spacing", "points"].forEach((id) => text(id, "—"));
  text("orientation", "Route needs regeneration");
  text(
    "budget",
    "Generate a route to compare model time with the nominal duration and reserve.",
  );
  status(message);
  render();
}
function settings() {
  return Object.fromEntries(
    fields.map((id) => {
      if (!$(id).value.trim())
        throw new Error("Enter every survey assumption.");
      const value = Number($(id).value);
      return [
        id,
        ["sideOverlap", "frontOverlap"].includes(id) ? value / 100 : value,
      ];
    }),
  );
}
function featureOf(input) {
  const geometry =
    input.type === "FeatureCollection"
      ? input.features?.[0]?.geometry
      : input.type === "Feature"
        ? input.geometry
        : input;
  return {
    type: "Feature",
    properties: {},
    geometry: structuredClone(geometry),
  };
}
function generate() {
  try {
    if (drawing)
      throw new Error("Finish or cancel the ring before generating a route.");
    const input = parseBoundedJson($("source").value),
      options = settings(),
      result = createSurvey(input, options);
    boundary = featureOf(input);
    bounds = viewBounds(boundary);
    report = result;
    snapshot = {
      input: structuredClone(input),
      options: structuredClone(options),
    };
    text("distance", `${(result.plan.distanceM / 1000).toFixed(2)} km`);
    text("duration", `${(result.plan.estimatedSeconds / 60).toFixed(1)} min`);
    text("spacing", `${result.plan.assumptions.spacingM.toFixed(1)} m`);
    text("points", String(result.plan.waypoints.length));
    text("orientation", "Open route · start → end");
    text(
      "budget",
      `${result.plan.withinBatteryBudget ? "Within" : "Exceeds"} the nominal time budget: ${(result.plan.estimatedSeconds / 60).toFixed(2)} of ${(result.plan.usableBatterySeconds / 60).toFixed(1)} usable minutes; ${result.plan.estimatedBatteryPercent.toFixed(1)}% of the full nominal duration. No wind, turns, climb, or return allowance is modeled.`,
    );
    status(
      `Route generated: ${result.plan.legs.filter((leg) => leg.kind === "survey").length} survey legs. Centreline connectors checked. Camera sampling suggestion: ${result.camera.suggestedSamplingDistanceM.toFixed(1)} m; no trigger commands are exported.`,
    );
    exports.forEach((id) => ($(id).disabled = false));
    render();
  } catch (error) {
    boundary = null;
    invalidate();
    status(error.message, true);
  }
}
const svgNode = (name, attributes = {}, value) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, content] of Object.entries(attributes))
    node.setAttribute(key, String(content));
  if (value !== undefined) node.textContent = value;
  return node;
};
function render() {
  const map = $("map");
  map.querySelectorAll(".content").forEach((node) => node.remove());
  map.classList.toggle("drawing", !!drawing);
  const group = svgNode("g", { class: "content" }),
    project = projection(bounds),
    p = (point) =>
      project
        .forward(point)
        .map((value) => value.toFixed(3))
        .join(",");
  const defs = svgNode("defs"),
    pattern = svgNode("pattern", {
      id: "hatch",
      width: 9,
      height: 9,
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(45)",
    });
  pattern.append(
    svgNode("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 9,
      stroke: "#b7a893",
      "stroke-width": 2,
    }),
  );
  defs.append(pattern);
  group.append(defs);
  for (let i = 1; i < 6; i++) {
    const x = 64 + i * 145,
      y = 40 + i * 108;
    group.append(
      svgNode("line", { x1: x, y1: 30, x2: x, y2: 650, class: "grid-line" }),
      svgNode("line", { x1: 40, y1: y, x2: 960, y2: y, class: "grid-line" }),
    );
    group.append(
      svgNode(
        "text",
        { x, y: 677, "text-anchor": "middle", class: "map-label" },
        `${project.inverse([x, 350])[0].toFixed(5)}° lon`,
      ),
    );
    group.append(
      svgNode(
        "text",
        { x: 18, y: y - 7, class: "map-label" },
        `${project.inverse([500, y])[1].toFixed(5)}° lat`,
      ),
    );
  }
  if (boundary) {
    const rings = boundary.geometry.coordinates,
      path = rings.map((ring) => `M${ring.map(p).join(" L")} Z`).join(" ");
    group.append(svgNode("path", { d: path, class: "boundary" }));
    rings
      .slice(1)
      .forEach((ring) =>
        group.append(
          svgNode("polygon", {
            points: ring.map(p).join(" "),
            fill: "url(#hatch)",
            stroke: "#8d785f",
            "stroke-width": 1.5,
          }),
        ),
      );
  }
  if (report) {
    report.plan.legs.forEach((leg) =>
      group.append(
        svgNode("polyline", {
          points: `${p(leg.from)} ${p(leg.to)}`,
          class: `route-${leg.kind}`,
        }),
      ),
    );
    const points = report.plan.waypoints;
    [points[0], points.at(-1)].forEach((point, index) => {
      const [x, y] = project.forward([point.lon, point.lat]);
      group.append(
        svgNode("circle", {
          cx: x,
          cy: y,
          r: 6,
          class: index ? "endpoint end" : "endpoint",
        }),
        svgNode(
          "text",
          { x: x + 12, y: y + (index ? 18 : -12), class: "endpoint-label" },
          index ? "END" : "START",
        ),
      );
    });
  }
  if (drawing) {
    group.append(
      svgNode("polyline", {
        points: drawing.points.map(p).join(" "),
        class: "draft",
      }),
    );
    drawing.points.forEach((point) => {
      const [x, y] = project.forward(point);
      group.append(
        svgNode("circle", { cx: x, cy: y, r: 5, class: "draft-point" }),
      );
    });
  }
  map.append(group);
}
function download(name, value, type) {
  const url = URL.createObjectURL(new Blob([value], { type })),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function save(kind) {
  try {
    if (!snapshot)
      throw new Error("Generate a current route before exporting.");
    let home;
    if (kind === "wpl") {
      const ids = ["home-lat", "home-lon", "home-alt"];
      if (ids.some((id) => !$(id).value.trim()))
        throw new Error(
          "Enter home latitude, longitude, and AMSL altitude explicitly.",
        );
      home = {
        lat: Number($("home-lat").value),
        lon: Number($("home-lon").value),
        altitudeAmslM: Number($("home-alt").value),
      };
    }
    const result = buildArtifacts(snapshot.input, snapshot.options, home);
    if (kind === "wpl") download("survey.waypoints", result.wpl, "text/plain");
    else if (kind === "geojson")
      download(
        "route.geojson",
        JSON.stringify(result.geojson, null, 2) + "\n",
        "application/geo+json",
      );
    else
      download(
        "plan.json",
        JSON.stringify(result.report, null, 2) + "\n",
        "application/json",
      );
    status(
      kind === "wpl"
        ? "Waypoint file validated and saved. Home is AMSL; route heights are relative to home. Review the open route and vehicle settings before use."
        : "Current route saved locally.",
    );
  } catch (error) {
    status(error.message, true);
  }
}
function updateDrawing() {
  text(
    "drawing-status",
    `${drawing.hole ? "Exclusion" : "Boundary"}: ${drawing.points.length} vertices. Click the grid or enter coordinates. Finish with at least three distinct vertices.`,
  );
  render();
}
function beginDrawing(hole) {
  if (hole && !boundary) {
    status("Generate an outer boundary before drawing an exclusion.", true);
    return;
  }
  drawing = { hole, points: [] };
  $("drawing-tools").hidden = false;
  invalidate(
    "Drawing started. The grid stays fixed until this ring is complete.",
  );
  updateDrawing();
}
function addPoint(point) {
  if (!drawing) return;
  try {
    if (
      point.length !== 2 ||
      !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 80
    )
      throw new Error(
        "Use finite longitude/latitude values within the supported bounds.",
      );
    if (drawing.points.length >= 999)
      throw new Error("The ring vertex limit is reached.");
    drawing.points.push(point);
    updateDrawing();
  } catch (error) {
    status(error.message, true);
  }
}
function cancelDrawing() {
  drawing = null;
  $("drawing-tools").hidden = true;
  render();
}
$("generate").addEventListener("click", generate);
fields.forEach((id) => $(id).addEventListener("input", () => invalidate()));
$("source").addEventListener("input", () => {
  cancelDrawing();
  boundary = null;
  invalidate();
});
$("draw-outer").addEventListener("click", () => beginDrawing(false));
$("draw-hole").addEventListener("click", () => beginDrawing(true));
$("cancel-ring").addEventListener("click", () => {
  cancelDrawing();
  status("Ring canceled. Generate the survey to restore its route.");
});
$("undo-vertex").addEventListener("click", () => {
  if (drawing) {
    drawing.points.pop();
    updateDrawing();
  }
});
$("add-vertex").addEventListener("click", () => {
  if (!$("vertex-lon").value.trim() || !$("vertex-lat").value.trim()) {
    status("Enter both vertex coordinates.", true);
    return;
  }
  addPoint([Number($("vertex-lon").value), Number($("vertex-lat").value)]);
});
$("finish-ring").addEventListener("click", () => {
  try {
    const candidate = withRing(boundary, drawing.points, drawing.hole);
    createSurvey(candidate, settings());
    boundary = candidate;
    $("source").value = JSON.stringify(boundary, null, 2);
    cancelDrawing();
    generate();
  } catch (error) {
    status(error.message, true);
  }
});
$("map").addEventListener("click", (event) => {
  if (!drawing) return;
  const point = $("map").createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform($("map").getScreenCTM().inverse());
  addPoint(projection(bounds).inverse([local.x, local.y]));
});
$("download-report").addEventListener("click", () => save("report"));
$("download-geojson").addEventListener("click", () => save("geojson"));
$("download-wpl").addEventListener("click", () => save("wpl"));
async function loadExample() {
  try {
    const response = await fetch("./fixtures/area-with-hole.geojson");
    if (!response.ok) throw new Error("Example could not be loaded.");
    const source = await response.text();
    parseBoundedJson(source);
    cancelDrawing();
    $("source").value = source;
    generate();
  } catch (error) {
    status(error.message, true);
  }
}
$("example").addEventListener("click", loadExample);
$("area-file").addEventListener("change", async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 512 * 1024)
      throw new Error("GeoJSON must be at most 512 KiB.");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    parseBoundedJson(content);
    cancelDrawing();
    $("source").value = content;
    generate();
  } catch (error) {
    invalidate();
    status(error.message, true);
  } finally {
    event.target.value = "";
  }
});
render();
await loadExample();
