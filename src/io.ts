import { constants } from "node:fs";
import { lstat, open, mkdir, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { QethError } from "../vendor/qeth/errors.ts";

export async function readTextFile(
  path: string,
  limit: number,
): Promise<string> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit)
    throw new QethError(
      "Input must be a regular file within the documented byte limit.",
    );
  const handle = await open(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit)
      throw new QethError("Input is not a supported regular file.");
    const chunks: Buffer[] = [];
    let count = 0;
    for (;;) {
      const buffer = Buffer.allocUnsafe(Math.min(65536, limit + 1 - count));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      count += bytesRead;
      if (count > limit)
        throw new QethError("Input exceeded the byte limit while reading.");
      chunks.push(buffer.subarray(0, bytesRead));
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
      );
    } catch {
      throw new QethError("Input must use valid UTF-8.");
    }
  } finally {
    await handle.close();
  }
}
export async function writeNewBundle(
  destination: string,
  artifacts: Record<string, string>,
): Promise<void> {
  await mkdir(destination);
  const owned: string[] = [];
  try {
    for (const [name, text] of Object.entries(artifacts)) {
      const path = join(destination, name),
        handle = await open(path, "wx");
      owned.push(path);
      try {
        await handle.writeFile(text, "utf8");
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    await Promise.all(owned.map((path) => unlink(path).catch(() => {})));
    await rmdir(destination).catch(() => {});
    throw error;
  }
}
