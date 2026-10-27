import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
test("vendored Qeth source and license match their pinned exact bytes", async () => {
  const root = new URL("../vendor/qeth/", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL("UPSTREAM.json", root), "utf8"),
  );
  assert.equal(manifest.commit, "fda093afd02e5bb4066d5b083a50c623aad6a228");
  for (const file of manifest.files)
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL(file.path, root)))
        .digest("hex"),
      file.sha256,
    );
  assert.deepEqual(manifest.local_source_patches, []);
});
