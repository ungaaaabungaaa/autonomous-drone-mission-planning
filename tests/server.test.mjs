import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { createViewerServer } from "../scripts/server-lib.mjs";
test("viewer serves only public files on the loopback host and handles HEAD without a body", async () => {
  const root = await mkdtemp(join(tmpdir(), "drone-server-"));
  await writeFile(join(root, "index.html"), "<p>Local viewer</p>");
  await writeFile(join(root, "private.key"), "secret");
  const server = createViewerServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const fetchPath = (path, method = "GET", host = `127.0.0.1:${port}`) =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port, path, method, headers: { host } },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode, body, headers: res.headers }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  try {
    const page = await fetchPath("/");
    assert.equal(page.status, 200);
    assert.equal(page.body, "<p>Local viewer</p>");
    assert.match(page.headers["content-security-policy"], /connect-src 'self'/);
    const head = await fetchPath("/", "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
    assert.equal(
      head.headers["content-length"],
      String(Buffer.byteLength(page.body)),
    );
    assert.equal((await fetchPath("/private.key")).status, 404);
    assert.equal((await fetchPath("/../package.json")).status, 404);
    assert.equal((await fetchPath("/", "POST")).status, 405);
    assert.equal((await fetchPath("/", "GET", "attacker.example")).status, 403);
    await writeFile(join(root, "app.mjs"), "x".repeat(1048577));
    assert.equal((await fetchPath("/app.mjs")).status, 404);
    try {
      await symlink(join(root, "private.key"), join(root, "styles.css"));
    } catch (error) {
      if (error.code !== "EPERM") throw error;
      return;
    }
    assert.equal((await fetchPath("/styles.css")).status, 404);
    // An allowlisted name must not follow a link outside the public directory.
    await rm(join(root, "styles.css"));
    await symlink(join(root, "..", "outside.css"), join(root, "styles.css"));
    assert.equal((await fetchPath("/styles.css")).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
