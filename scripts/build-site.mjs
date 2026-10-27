import { mkdir, rm, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url)),
  destination = join(root, "site");
await rm(destination, { recursive: true, force: true });
const sources = {
  "index.html": "web/index.html",
  "styles.css": "web/styles.css",
  "app.mjs": "web/app.mjs",
  "draw-model.mjs": "web/draw-model.mjs",
  "src/planner.js": "dist/src/planner.js",
  "src/validation.js": "dist/src/validation.js",
  "src/wpl.js": "dist/src/wpl.js",
  "vendor/qeth/mission.js": "dist/vendor/qeth/mission.js",
  "vendor/qeth/errors.js": "dist/vendor/qeth/errors.js",
  "fixtures/area-with-hole.geojson": "examples/area-with-hole.geojson",
};
for (const [destinationName, source] of Object.entries(sources)) {
  const target = join(destination, destinationName);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, source), target);
}
console.log(`Built ${Object.keys(sources).length} allowlisted static files.`);
