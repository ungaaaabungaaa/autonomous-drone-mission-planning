import test from "node:test";
import assert from "node:assert/strict";
import {
  closeRing,
  withRing,
  viewBounds,
  projection,
} from "../web/draw-model.mjs";

test("drawing closes rings without mutating input and requires distinct finite vertices", () => {
  const points = [
      [77, 12],
      [77.01, 12],
      [77.01, 12.01],
    ],
    original = structuredClone(points);
  assert.deepEqual(closeRing(points), [...points, points[0]]);
  assert.deepEqual(points, original);
  for (const bad of [
    [],
    [
      [0, 0],
      [1, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [1, 0],
      [NaN, 1],
    ],
    [
      [0, 0, 1],
      [1, 0],
      [0, 1],
    ],
  ])
    assert.throws(() => closeRing(bad));
  const outer = withRing(null, points, false),
    hole = [
      [77.001, 12.001],
      [77.002, 12.001],
      [77.002, 12.002],
    ];
  assert.equal(withRing(outer, hole, true).geometry.coordinates.length, 2);
  assert.equal(outer.geometry.coordinates.length, 1);
  assert.throws(() => withRing(null, hole, true));
});
test("coordinate projection has a stable inverse and preserves local metre aspect", () => {
  const area = withRing(
      null,
      [
        [77, 12],
        [77.01, 12],
        [77.01, 12.01],
      ],
      false,
    ),
    bounds = viewBounds(area);
  const transform = projection(bounds, 1000, 700);
  for (const point of [
    [77, 12],
    [77.005, 12.005],
    [77.01, 12.01],
  ]) {
    const back = transform.inverse(transform.forward(point));
    assert.ok(Math.abs(back[0] - point[0]) < 1e-10);
    assert.ok(Math.abs(back[1] - point[1]) < 1e-10);
  }
  const bad = structuredClone(area);
  bad.geometry.coordinates[0][0][0] = Infinity;
  assert.throws(() => viewBounds(bad));
  assert.throws(() => projection(bounds, 0, 700));
  assert.ok(viewBounds(null).maxLon > viewBounds(null).minLon);
});
