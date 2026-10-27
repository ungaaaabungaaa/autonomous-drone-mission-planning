import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { main } from "../dist/src/cli.js";
import { parseWpl, serializeWpl } from "../dist/src/wpl.js";
import { projection, viewBounds } from "../web/draw-model.mjs";
const root = fileURLToPath(new URL("..", import.meta.url)),
  temporary = await mkdtemp(join(tmpdir(), "drone-demo-"));
try {
  const output = join(temporary, "bundle");
  let diagnostic = "";
  const code = await main(
    [
      "plan",
      join(root, "examples/area-with-hole.geojson"),
      "--settings",
      join(root, "examples/settings.json"),
      "--home",
      join(root, "examples/home.json"),
      "--out",
      output,
    ],
    (text) => (diagnostic += text),
    (text) => (diagnostic += text),
  );
  assert.equal(code, 0, diagnostic);
  const artifacts = {};
  for (const name of ["plan.json", "route.geojson", "survey.waypoints"])
    artifacts[name] = await readFile(join(output, name), "utf8");
  const report = JSON.parse(artifacts["plan.json"]),
    items = parseWpl(artifacts["survey.waypoints"]);
  assert.deepEqual(parseWpl(serializeWpl(items)), items);
  assert.equal(items[0].frame, 0);
  assert.equal(items[0].params[6], 900);
  assert.equal(items.length, report.plan.waypoints.length + 1);
  assert.ok(
    items.slice(1).every((item) => item.frame === 3 && item.params[6] === 50),
  );
  assert.equal(report.plan.estimatedSeconds, report.plan.distanceM / 5);
  const boundary = report.plan.geojson.features.find(
      (feature) => feature.geometry.type === "Polygon",
    ),
    transform = projection(viewBounds(boundary), 1000, 700),
    p = (point) =>
      transform
        .forward(point)
        .map((value) => value.toFixed(3))
        .join(",");
  artifacts["route.svg"] =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="760" viewBox="0 0 1000 760" role="img" aria-labelledby="title desc"><title id="title">Synthetic open survey route</title><desc id="desc">Measured planner output. Blue survey lines and dashed orange transit lines avoid a centreline exclusion. No real flight was performed.</desc><rect width="1000" height="760" fill="#f4f3ed"/><path d="${boundary.geometry.coordinates.map((ring) => `M${ring.map(p).join(" L")} Z`).join(" ")}" fill="#dce6d4" fill-rule="evenodd" stroke="#4f674a" stroke-width="2"/>${report.plan.legs.map((leg) => `<polyline points="${p(leg.from)} ${p(leg.to)}" fill="none" stroke="${leg.kind === "survey" ? "#1558af" : "#9b4a1d"}" stroke-width="2"${leg.kind === "transit" ? ' stroke-dasharray="5 5"' : ""}/>`).join("")}<text x="35" y="722" fill="#1f302a" font-size="18" font-family="sans-serif">Synthetic example · ${report.plan.distanceM.toFixed(1)} m · ${(report.plan.estimatedSeconds / 60).toFixed(2)} model min · ${report.plan.waypoints.length} route points</text><text x="35" y="746" fill="#596961" font-size="13" font-family="sans-serif">Open route. No home connectors, terrain model, takeoff, landing, RTL, or flight validation.</text></svg>\n`;
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  artifacts["summary.json"] =
    JSON.stringify(
      {
        kind: "synthetic-fixture-run",
        coreRevision: report.coreRevision,
        inputSha256: sha(
          await readFile(join(root, "examples/area-with-hole.geojson"), "utf8"),
        ),
        distanceM: report.plan.distanceM,
        estimatedSeconds: report.plan.estimatedSeconds,
        spacingM: report.plan.assumptions.spacingM,
        surveyLegs: report.plan.legs.filter((leg) => leg.kind === "survey")
          .length,
        transitLegs: report.plan.legs.filter((leg) => leg.kind === "transit")
          .length,
        navigationWaypoints: items.length - 1,
        wplRows: items.length,
        homeFrame: items[0].frame,
        navigationFrames: [
          ...new Set(items.slice(1).map((item) => item.frame)),
        ],
        homeAmslM: items[0].params[6],
        relativeHomeAltitudeM: 50,
        estimatedBatteryPercent: report.plan.estimatedBatteryPercent,
        usableBatterySeconds: report.plan.usableBatterySeconds,
        artifactsSha256: Object.fromEntries(
          Object.entries(artifacts).map(([name, content]) => [
            name,
            sha(content),
          ]),
        ),
        note: "Synthetic fixture and synthetic home metadata, not a measured site or real flight.",
      },
      null,
      2,
    ) + "\n";
  const destination = join(root, "docs/demo");
  if (process.argv.includes("--write")) {
    await mkdir(destination, { recursive: true });
    for (const [name, content] of Object.entries(artifacts))
      await writeFile(join(destination, name), content);
    console.log("Wrote 5 actual synthetic-demo artifacts.");
  } else {
    for (const [name, content] of Object.entries(artifacts))
      assert.equal(
        await readFile(join(destination, name), "utf8"),
        content,
        `Reproduction differs: ${name}`,
      );
    console.log(
      "5 demo artifacts reproduced byte-for-byte; WPL field/frame round trip passed.",
    );
  }
  console.log(diagnostic.trim());
} finally {
  await rm(temporary, { recursive: true, force: true });
}
