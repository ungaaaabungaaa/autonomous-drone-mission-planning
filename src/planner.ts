import { planMission, type MissionReport } from "../vendor/qeth/mission.ts";
import { QethError } from "../vendor/qeth/errors.ts";
import { finite, record } from "./validation.ts";

export interface SurveySettings {
  cameraAglM: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  sideOverlap: number;
  frontOverlap: number;
  relativeHomeAltitudeM: number;
  speedMps: number;
  batteryMinutes: number;
  reservePercent: number;
}
export interface SurveyReport {
  schemaVersion: 1;
  kind: "offline-survey-plan";
  options: SurveySettings;
  altitudeReference: "relative-home";
  homeConnectorsGenerated: false;
  coreRevision: string;
  plan: MissionReport;
  camera: {
    footprintWidthM: number;
    footprintLengthM: number;
    suggestedSamplingDistanceM: number;
    assumedAglM: number;
    model: string;
  };
  warnings: string[];
}
export function surveySettings(input: unknown = {}): SurveySettings {
  if (!record(input)) throw new QethError("Survey settings must be an object.");
  const defaults: SurveySettings = {
    cameraAglM: 50,
    horizontalFovDeg: 60,
    verticalFovDeg: 45,
    sideOverlap: 0.7,
    frontOverlap: 0.75,
    relativeHomeAltitudeM: 50,
    speedMps: 5,
    batteryMinutes: 25,
    reservePercent: 20,
  };
  if (Object.keys(input).some((key) => !Object.hasOwn(defaults, key)))
    throw new QethError("Survey settings contain an unknown field.");
  const bounds: Record<keyof SurveySettings, [number, number]> = {
    cameraAglM: [5, 500],
    horizontalFovDeg: [10, 150],
    verticalFovDeg: [10, 120],
    sideOverlap: [0, 0.95],
    frontOverlap: [0, 0.95],
    relativeHomeAltitudeM: [1, 500],
    speedMps: [0.1, 100],
    batteryMinutes: [1, 1440],
    reservePercent: [0, 90],
  };
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof SurveySettings)[])
    result[key] = finite(
      Object.hasOwn(input, key) ? input[key] : defaults[key],
      key,
      ...bounds[key],
    );
  return result;
}
export function createSurvey(
  input: unknown,
  settings: unknown = {},
): SurveyReport {
  const options = surveySettings(settings);
  const footprintWidthM =
    2 *
    options.cameraAglM *
    Math.tan((options.horizontalFovDeg * Math.PI) / 360);
  const footprintLengthM =
    2 * options.cameraAglM * Math.tan((options.verticalFovDeg * Math.PI) / 360);
  const spacingM = footprintWidthM * (1 - options.sideOverlap);
  if (spacingM < 1 || spacingM > 1000)
    throw new QethError(
      "Camera assumptions must produce sweep spacing from 1 to 1000 m.",
    );
  const core = planMission(input, {
    spacingM,
    speedMps: options.speedMps,
    altitudeM: options.relativeHomeAltitudeM,
    batteryMinutes: options.batteryMinutes,
    reservePercent: options.reservePercent,
    optimize: "distance",
  });
  if (core.waypoints.length > 2000)
    throw new QethError(
      "This export tool supports at most 2000 waypoints; increase spacing or simplify the area.",
    );
  const plan: MissionReport = {
    ...core,
    geojson: {
      ...core.geojson,
      features: core.geojson.features.map((feature) =>
        feature.properties.role === "offline-survey-route"
          ? {
              ...feature,
              properties: {
                ...feature.properties,
                altitudeReference: "relative-home",
              },
            }
          : feature,
      ),
    },
  };
  return {
    schemaVersion: 1,
    kind: "offline-survey-plan",
    options,
    altitudeReference: "relative-home",
    homeConnectorsGenerated: false,
    coreRevision: "fda093afd02e5bb4066d5b083a50c623aad6a228",
    plan,
    camera: {
      footprintWidthM,
      footprintLengthM,
      suggestedSamplingDistanceM: footprintLengthM * (1 - options.frontOverlap),
      assumedAglM: options.cameraAglM,
      model:
        "Ideal nadir camera over flat ground at an independently assumed AGL height; no terrain or gimbal model.",
    },
    warnings: [
      ...core.warnings,
      "Waypoint altitude is relative to home. Camera AGL is an independent assumption, not a terrain-derived height.",
      "Exclusions constrain the mathematical route centreline, not camera footprints, vehicle clearance, waypoint acceptance, or a transmitted geofence.",
      "Home connectors, takeoff, landing, and RTL are not generated. Speed and camera-trigger settings are not commanded by the waypoint export.",
      "Time and battery results use constant-speed and nominal-duration assumptions; they are not flight approval or measured energy consumption.",
    ],
  };
}
