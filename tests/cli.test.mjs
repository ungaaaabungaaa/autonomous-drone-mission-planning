import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.ts";
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
  ],
};
test("CLI produces a complete open-route bundle, checks its format, and refuses overwrite", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "drone-cli-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, "area.json"),
    home = join(dir, "home.json"),
    out = join(dir, "out");
  await writeFile(input, JSON.stringify(area));
  await writeFile(home, JSON.stringify({ lat: 0, lon: 0, altitudeAmslM: 100 }));
  let stdout = "",
    stderr = "";
  const run = (args) =>
    main(
      args,
      (x) => (stdout += x),
      (x) => (stderr += x),
    );
  assert.equal(
    await run(["plan", input, "--home", home, "--out", out]),
    0,
    stderr,
  );
  const report = JSON.parse(await readFile(join(out, "plan.json"), "utf8"));
  assert.equal(report.plannedHome.altitudeAmslM, 100);
  assert.ok(report.plan.distanceM > 0);
  assert.equal(await run(["check", join(out, "survey.waypoints")]), 0);
  assert.match(stdout, /relative-home/);
  const prior = await readFile(join(out, "plan.json"), "utf8");
  assert.equal(await run(["plan", input, "--home", home, "--out", out]), 1);
  assert.equal(await readFile(join(out, "plan.json"), "utf8"), prior);
});
test("CLI handles malformed arguments, invalid UTF8, oversized files, and symlinks", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "drone-bad-input-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "area.json"),
    out = join(dir, "out");
  const run = (args) =>
    main(
      args,
      () => {},
      () => {},
    );
  for (const args of [
    ["unknown"],
    ["plan"],
    ["plan", file, "--out"],
    ["plan", file, "--bad", "x"],
    ["plan", file, "--out", out, "--out", out],
    ["check"],
  ])
    assert.equal(await run(args), 2);
  await writeFile(file, Buffer.from([0xff]));
  assert.equal(await run(["plan", file, "--out", out]), 2);
  await writeFile(file, "x".repeat(524289));
  assert.equal(await run(["plan", file, "--out", out]), 2);
  await writeFile(file, JSON.stringify(area));
  const link = join(dir, "link.json");
  try {
    await symlink(file, link);
  } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") return;
    throw error;
  }
  assert.equal(await run(["plan", link, "--out", out]), 2);
});
test("check prints metadata-derived AMSL bounds without treating altitude as terrain AGL", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "drone-altitude-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "mission.waypoints");
  const { buildArtifacts } = await import("../src/wpl.ts");
  await writeFile(file, buildArtifacts(area, { relativeHomeAltitudeM: 70 }, {
    lat: 0, lon: 0, altitudeAmslM: 900,
  }).wpl);
  let output = "", error = "";
  assert.equal(await main(["check", file], x => output += x, x => error += x), 0, error);
  const report = JSON.parse(output);
  assert.equal(report.altitudeSummary.minimumDerivedAmslM, 970);
  assert.equal(report.altitudeSummary.maximumDerivedAmslM, 970);
  assert.match(report.altitudeSummary.assumption, /no terrain/);
});
