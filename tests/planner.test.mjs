import test from "node:test";
import assert from "node:assert/strict";
import { createSurvey } from "../src/planner.ts";
import { parseBoundedJson } from "../src/validation.ts";

const area = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0.002, 0],
      [0.002, 0.002],
      [0, 0.002],
      [0, 0],
    ],
    [
      [0.0007, 0.0007],
      [0.0013, 0.0007],
      [0.0013, 0.0013],
      [0.0007, 0.0013],
      [0.0007, 0.0007],
    ],
  ],
};
test("camera assumptions derive spacing while altitude frames remain separate", () => {
  const report = createSurvey(area, {
    cameraAglM: 40,
    relativeHomeAltitudeM: 70,
    horizontalFovDeg: 60,
    sideOverlap: 0.5,
    speedMps: 4,
  });
  assert.ok(
    Math.abs(report.camera.footprintWidthM - 80 * Math.tan(Math.PI / 6)) <
      1e-10,
  );
  assert.equal(
    report.plan.assumptions.spacingM,
    report.camera.footprintWidthM * 0.5,
  );
  assert.ok(report.plan.waypoints.every((p) => p.altitudeM === 70));
  assert.equal(report.altitudeReference, "relative-home");
  assert.equal(
    report.plan.geojson.features[1].properties.altitudeReference,
    "relative-home",
  );
  assert.ok(
    report.plan.geojson.features[1].geometry.coordinates.every(
      (p) => p.length === 2,
    ),
  );
  assert.equal(report.plan.estimatedSeconds, report.plan.distanceM / 4);
  assert.equal(report.homeConnectorsGenerated, false);
});
test("unknown, nonfinite, boolean, and unsupported camera settings fail", () => {
  for (const options of [
    { invented: 1 },
    { cameraAglM: true },
    { horizontalFovDeg: NaN },
    { frontOverlap: 1 },
    { sideOverlap: -1 },
    { cameraAglM: 5, horizontalFovDeg: 10, sideOverlap: 0.95 },
  ])
    assert.throws(() => createSurvey(area, options));
});
test("bounded JSON rejects deep, large and malformed inputs before the geometry solver", () => {
  assert.deepEqual(parseBoundedJson('{"ok":1}'), { ok: 1 });
  for (const text of [
    "{bad",
    "[".repeat(100) + "]".repeat(100),
    "x".repeat(524289),
  ])
    assert.throws(() => parseBoundedJson(text));
});
test("time scales with speed and battery denominators use full duration and reserve separately", () => {
  const a = createSurvey(area, {
      speedMps: 5,
      batteryMinutes: 10,
      reservePercent: 25,
    }),
    b = createSurvey(area, {
      speedMps: 10,
      batteryMinutes: 20,
      reservePercent: 0,
    });
  assert.deepEqual(a.plan.waypoints, b.plan.waypoints);
  assert.equal(a.plan.distanceM, b.plan.distanceM);
  assert.equal(a.plan.estimatedSeconds, 2 * b.plan.estimatedSeconds);
  assert.equal(a.plan.usableBatterySeconds, 450);
  assert.equal(b.plan.usableBatterySeconds, 1200);
  assert.equal(
    a.plan.estimatedBatteryPercent,
    (a.plan.estimatedSeconds / 600) * 100,
  );
  assert.equal(a.plan.withinBatteryBudget, a.plan.estimatedSeconds <= 450);
  // The along-track suggestion does not silently create trigger commands or change route spacing.
  const c = createSurvey(area, { frontOverlap: 0.9 });
  assert.deepEqual(c.plan.waypoints, createSurvey(area).plan.waypoints);
  assert.ok(
    c.camera.suggestedSamplingDistanceM <
      createSurvey(area).camera.suggestedSamplingDistanceM,
  );
});
