import { QethError } from "../vendor/qeth/errors.ts";

export const MAX_JSON_BYTES = 512 * 1024;
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function finite(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new QethError(
      `${name} must be a finite number from ${min} to ${max}.`,
    );
  return value;
}
export function parseBoundedJson(
  text: string,
  limit = MAX_JSON_BYTES,
): unknown {
  if (
    typeof text !== "string" ||
    text.length > limit ||
    new TextEncoder().encode(text).length > limit
  )
    throw new QethError("JSON input exceeds the supported byte limit.");
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new QethError("Input must contain valid JSON.");
  }
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++nodes > 50_000 || item.depth > 32)
      throw new QethError("JSON exceeds the depth or node limit.");
    if (item.value !== null && typeof item.value === "object")
      for (const child of Object.values(item.value))
        stack.push({ value: child, depth: item.depth + 1 });
  }
  return value;
}
