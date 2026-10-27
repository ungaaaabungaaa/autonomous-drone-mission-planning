import { QethError } from "../vendor/qeth/errors.ts";
import { createSurvey, type SurveyReport } from "./planner.ts";
import { finite, record } from "./validation.ts";

export type MissionParams = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export interface MissionItem {
  sequence: number;
  current: number;
  frame: number;
  command: number;
  params: MissionParams;
  autoContinue: number;
}
export interface PlannedHome {
  lat: number;
  lon: number;
  altitudeAmslM: number;
}
export const MAX_WPL_BYTES = 1024 * 1024;

export function plannedHome(input: unknown): PlannedHome {
  if (
    !record(input) ||
    Object.keys(input).length !== 3 ||
    Object.keys(input).some(
      (key) => !["lat", "lon", "altitudeAmslM"].includes(key),
    )
  )
    throw new QethError(
      "Home must explicitly provide lat, lon, and altitudeAmslM.",
    );
  return {
    lat: finite(input.lat, "Home latitude", -80, 80),
    lon: finite(input.lon, "Home longitude", -180, 180),
    altitudeAmslM: finite(
      input.altitudeAmslM,
      "Home AMSL altitude",
      -500,
      10000,
    ),
  };
}

function validateItems(input: unknown): MissionItem[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 2001)
    throw new QethError("WPL must contain 1 to 2001 supported rows.");
  return input.map((item: unknown, index): MissionItem => {
    if (
      !record(item) ||
      Object.keys(item).some(
        (key) =>
          ![
            "sequence",
            "current",
            "frame",
            "command",
            "params",
            "autoContinue",
          ].includes(key),
      )
    )
      throw new QethError(`Invalid WPL row ${index}.`);
    if (
      item.sequence !== index ||
      item.current !== (index === 0 ? 1 : 0) ||
      item.autoContinue !== 1 ||
      item.command !== 16 ||
      (item.frame !== 0 && item.frame !== 3) ||
      (index === 0 && item.frame !== 0)
    )
      throw new QethError(
        `Unsupported sequence, flag, command, or frame at WPL row ${index}.`,
      );
    if (!Array.isArray(item.params) || item.params.length !== 7)
      throw new QethError(`WPL row ${index} needs exactly seven parameters.`);
    const params = item.params.map((value, i) =>
      finite(
        value,
        `WPL row ${index} parameter ${i + 1}`,
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
      ),
    ) as MissionParams;
    finite(params[0], "Hold time", 0, 3600);
    finite(params[1], "Acceptance radius", 0, 1000);
    if (params[2] !== 0)
      throw new QethError("Only pass-through waypoint radius 0 is supported.");
    finite(params[3], "Yaw degrees", -180, 360);
    finite(params[4], "Latitude", -90, 90);
    finite(params[5], "Longitude", -180, 180);
    finite(params[6], "Altitude metres", -500, 10000);
    return {
      sequence: index,
      current: item.current as number,
      frame: item.frame as number,
      command: 16,
      params,
      autoContinue: 1,
    };
  });
}

export function parseWpl(text: string): MissionItem[] {
  if (
    typeof text !== "string" ||
    text.length > MAX_WPL_BYTES ||
    new TextEncoder().encode(text).length > MAX_WPL_BYTES
  )
    throw new QethError("WPL exceeds the 1 MiB limit.");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (
    lines.shift() !== "QGC WPL 110" ||
    lines.length < 1 ||
    lines.length > 2001
  )
    throw new QethError("Use the supported QGC WPL 110 header and row count.");
  const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const items = lines.map((line, index) => {
    if (!line || line.length > 1024)
      throw new QethError(`Blank or oversized WPL row ${index}.`);
    const cells = line.split("\t").map((cell) => cell.trim());
    if (cells.length !== 12 || cells.some((cell) => !numberPattern.test(cell)))
      throw new QethError(
        `WPL row ${index} needs twelve tab-separated finite numeric fields.`,
      );
    const values = cells.map((cell) => {
      const value = Number(cell);
      return Object.is(value, -0) ? 0 : value;
    });
    return {
      sequence: values[0],
      current: values[1],
      frame: values[2],
      command: values[3],
      params: values.slice(4, 11),
      autoContinue: values[11],
    };
  });
  return validateItems(items);
}

export function serializeWpl(items: MissionItem[]): string {
  const checked = validateItems(items);
  const text =
    "QGC WPL 110\n" +
    checked
      .map((item) =>
        [
          item.sequence,
          item.current,
          item.frame,
          item.command,
          ...item.params,
          item.autoContinue,
        ]
          .map(String)
          .join("\t"),
      )
      .join("\n") +
    "\n";
  if (new TextEncoder().encode(text).length > MAX_WPL_BYTES)
    throw new QethError("Serialized mission exceeds 1 MiB.");
  return text;
}

function bearing(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
): number {
  const rad = Math.PI / 180,
    lat1 = a.lat * rad,
    lat2 = b.lat * rad,
    delta = (b.lon - a.lon) * rad;
  return (
    (Math.atan2(
      Math.sin(delta) * Math.cos(lat2),
      Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta),
    ) /
      rad +
      360) %
    360
  );
}
function missionItems(report: SurveyReport, home: PlannedHome): MissionItem[] {
  const points = report.plan.waypoints;
  const items: MissionItem[] = [
    {
      sequence: 0,
      current: 1,
      frame: 0,
      command: 16,
      params: [0, 0, 0, 0, home.lat, home.lon, home.altitudeAmslM],
      autoContinue: 1,
    },
  ];
  let yaw = 0;
  points.forEach((point, index) => {
    if (index + 1 < points.length) yaw = bearing(point, points[index + 1]!);
    items.push({
      sequence: index + 1,
      current: 0,
      frame: 3,
      command: 16,
      params: [0, 0, 0, yaw, point.lat, point.lon, point.altitudeM],
      autoContinue: 1,
    });
  });
  return items;
}

export function buildArtifacts(
  input: unknown,
  options: unknown = {},
  homeInput?: unknown,
): {
  report: SurveyReport & { plannedHome: PlannedHome | null };
  wpl?: string;
  geojson: SurveyReport["plan"]["geojson"];
} {
  // Re-plan from source geometry/settings rather than trusting an edited report.
  const home = homeInput === undefined ? null : plannedHome(homeInput);
  const report = { ...createSurvey(input, options), plannedHome: home };
  const wpl = home ? serializeWpl(missionItems(report, home)) : undefined;
  if (wpl) parseWpl(wpl);
  return { report, geojson: report.plan.geojson, ...(wpl ? { wpl } : {}) };
}
