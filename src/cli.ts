import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { QethError } from "../vendor/qeth/errors.ts";
import { parseBoundedJson, MAX_JSON_BYTES } from "./validation.ts";
import { buildArtifacts, parseWpl, MAX_WPL_BYTES } from "./wpl.ts";
import { readTextFile, writeNewBundle } from "./io.ts";

const HELP = `Offline survey planner\n\nplan AREA.geojson --out NEW_DIR [--settings OPTIONS.json] [--home HOME.json]\ncheck SURVEY.waypoints\n\nHome data must explicitly contain lat, lon, altitudeAmslM. Without it, plan exports only JSON/GeoJSON.\nRoutes are open: home connectors, takeoff, landing and RTL are not generated. No vehicle connection occurs.\n`;
export async function main(
  args: string[],
  out: (text: string) => void = (text) => process.stdout.write(text),
  err: (text: string) => void = (text) => process.stderr.write(text),
): Promise<number> {
  try {
    if (
      !args.length ||
      (args.length === 1 && args[0] === "--help") ||
      (args.length === 2 && args[0] === "plan" && args[1] === "--help")
    ) {
      out(HELP);
      return 0;
    }
    if (args[0] === "check") {
      if (args.length !== 2 || !args[1] || args[1].startsWith("--"))
        throw new QethError("check requires one .waypoints file.");
      const items = parseWpl(await readTextFile(args[1], MAX_WPL_BYTES));
      out(
        JSON.stringify(
          {
            format: "QGC WPL 110",
            plannedHomeAltitudeReference: "AMSL",
            navigationWaypoints: items.length - 1,
            navigationAltitudeReferences: [
              ...new Set(
                items
                  .slice(1)
                  .map((item) => (item.frame === 3 ? "relative-home" : "AMSL")),
              ),
            ],
            note: "Supported file syntax only; this does not validate vehicle behavior or flight approval.",
          },
          null,
          2,
        ) + "\n",
      );
      return 0;
    }
    if (args[0] !== "plan" || !args[1] || args[1].startsWith("--"))
      throw new QethError(
        "Use plan AREA --out NEW_DIR, check FILE, or --help.",
      );
    const options: Record<string, string> = {};
    for (let i = 2; i < args.length; i += 2) {
      const key = args[i]!,
        value = args[i + 1];
      if (
        !["--out", "--settings", "--home"].includes(key) ||
        !value ||
        value.startsWith("--") ||
        Object.hasOwn(options, key)
      )
        throw new QethError("Unknown, repeated, or missing command option.");
      options[key] = value;
    }
    if (!options["--out"])
      throw new QethError("A new --out directory is required.");
    const geometry = parseBoundedJson(
      await readTextFile(args[1], MAX_JSON_BYTES),
    );
    const settings = options["--settings"]
      ? parseBoundedJson(
          await readTextFile(options["--settings"], 65536),
          65536,
        )
      : {};
    const home = options["--home"]
      ? parseBoundedJson(await readTextFile(options["--home"], 16384), 16384)
      : undefined;
    const result = buildArtifacts(geometry, settings, home);
    const artifacts: Record<string, string> = {
      "plan.json": JSON.stringify(result.report, null, 2) + "\n",
      "route.geojson": JSON.stringify(result.geojson, null, 2) + "\n",
    };
    if (result.wpl) artifacts["survey.waypoints"] = result.wpl;
    await writeNewBundle(options["--out"], artifacts);
    out(
      `Offline open route: ${result.report.plan.waypoints.length} waypoints, ${result.report.plan.distanceM.toFixed(1)} m, ${(result.report.plan.estimatedSeconds / 60).toFixed(2)} model minutes.\n`,
    );
    out(
      result.wpl
        ? "WPL syntax round trip passed. Home metadata is AMSL; navigation altitude is relative to home.\n"
        : "No home supplied: WPL was not generated.\n",
    );
    out(
      "Home connectors, takeoff, landing and RTL are not included. No flight approval is implied.\n",
    );
    return 0;
  } catch (error) {
    err(`${error instanceof Error ? error.message : "Operation failed."}\n`);
    return error instanceof QethError ? error.exitCode : 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await main(process.argv.slice(2));
