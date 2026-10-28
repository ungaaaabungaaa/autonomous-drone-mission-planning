import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseWpl, serializeWpl, buildArtifacts } from "../src/wpl.ts";
const area = {
  type: "Polygon",
  coordinates: [
    [
      [77.59, 12.97],
      [77.592, 12.97],
      [77.592, 12.972],
      [77.59, 12.972],
      [77.59, 12.97],
    ],
  ],
};
const home = { lat: 12.969, lon: 77.589, altitudeAmslM: 900 };
test("official documentation row parses without swapping latitude/longitude and round trips", async () => {
  const text = await readFile(
    new URL("../fixtures/official-wpl110-home-row.waypoints", import.meta.url),
    "utf8",
  );
  const items = parseWpl(text);
  assert.equal(items[0].params[4], 8.548);
  assert.equal(items[0].params[5], 47.376);
  assert.equal(items[0].params[6], 550);
  assert.deepEqual(parseWpl(serializeWpl(items)), items);
});
test("export keeps home AMSL metadata separate from relative-home navigation and open route", () => {
  const result = buildArtifacts(area, { relativeHomeAltitudeM: 70 }, home);
  const items = parseWpl(result.wpl);
  assert.equal(items.length, result.report.plan.waypoints.length + 1);
  assert.equal(items[0].frame, 0);
  assert.equal(items[0].params[6], 900);
  assert.deepEqual(items[0].params.slice(4, 6), [home.lat, home.lon]);
  for (const [item, index] of items.slice(1).map((item, i) => [item, i])) {
    assert.equal(item.frame, 3);
    assert.equal(item.command, 16);
    assert.equal(item.params[6], 70);
    assert.equal(item.params[4], result.report.plan.waypoints[index].lat);
    assert.equal(item.params[5], result.report.plan.waypoints[index].lon);
  }
  assert.deepEqual(parseWpl(serializeWpl(items)), items);
  assert.equal(result.report.homeConnectorsGenerated, false);
});
test("all twelve fields, ordering, frames and supported semantics are validated", () => {
  const valid = buildArtifacts(area, {}, home).wpl;
  const lines = valid.trimEnd().split("\n");
  const invalid = [
    "2",
    "1",
    "10",
    "22",
    "-1",
    "-1",
    "1",
    "NaN",
    "91",
    "181",
    "Infinity",
    "0",
  ];
  for (let field = 0; field < 12; field++) {
    const fields = lines[2].split("\t");
    fields[field] = invalid[field];
    const bad = [...lines];
    bad[2] = fields.join("\t");
    assert.throws(() => parseWpl(bad.join("\n")), `field ${field}`);
  }
  for (const text of [
    valid.replace("110", "120"),
    valid + "\n",
    valid.replaceAll("\t", " "),
    "x".repeat(1048577),
  ])
    assert.throws(() => parseWpl(text));
});
test("export requires explicit finite home values and rejects edited reports as geometry", () => {
  for (const h of [
    { lat: 0, lon: 0 },
    { ...home, altitudeAmslM: NaN },
    { ...home, lat: 90 },
    { ...home, unknown: 1 },
  ])
    assert.throws(() => buildArtifacts(area, {}, h));
  const result = buildArtifacts(area);
  assert.equal(result.wpl, undefined);
  assert.throws(() => buildArtifacts(result.report, {}, home));
});
test("serializer rejects sparse mission rows instead of emitting an invalid WPL file", () => {
  const rows = parseWpl(buildArtifacts(area, {}, home).wpl);
  for (const sparse of [Array(1), [rows[0], , rows[1]], [, rows[0]]]) {
    assert.throws(() => serializeWpl(sparse), /Invalid WPL row/);
  }
  assert.deepEqual(parseWpl(serializeWpl(rows)), rows);
});
test("altitude summary resolves mixed frames after lossless coordinate round trips", async () => {
  const { wplAltitudeSummary } = await import("../src/wpl.ts");
  const rows = parseWpl(buildArtifacts(area, {}, home).wpl).slice(0, 3);
  rows[1].params[4] = -90;
  rows[1].params[5] = -180;
  rows[1].params[6] = 70;
  rows[2].frame = 0;
  rows[2].params[4] = 90;
  rows[2].params[5] = 180;
  rows[2].params[6] = 950;
  const restored = parseWpl(serializeWpl(rows));
  assert.deepEqual(restored, rows);
  const summary = wplAltitudeSummary(restored);
  assert.equal(summary.plannedHomeAmslM, 900);
  assert.equal(summary.minimumDerivedAmslM, 950);
  assert.equal(summary.maximumDerivedAmslM, 970);
  assert.deepEqual(summary.waypoints.map(row => row.derivedAmslM), [970, 950]);
  assert.deepEqual(summary.waypoints.map(row => row.sourceReference), ["relative-home", "AMSL"]);
  assert.equal(wplAltitudeSummary(rows.slice(0, 1)).minimumDerivedAmslM, null);
  assert.equal(wplAltitudeSummary(rows.slice(0, 1)).maximumDerivedAmslM, null);
  assert.throws(() => wplAltitudeSummary([, rows[1]]));
});
