# Offline survey and export contract, version 1

The planner accepts one 2D GeoJSON Polygon, optionally wrapped in one Feature or a single-feature FeatureCollection. Coordinates use longitude, latitude. Interior rings are route-centreline exclusions. The exact vendored Qeth core validates rings, holes, every survey/transit segment, projection extent, and bounded solver work. Input is at most 512 KiB, depth 32, 50,000 JSON nodes, and 1,000 positions. Routes are capped at 2,000 waypoints. Geographic bounds are latitude ±80°, longitude ±180°, no antimeridian crossing, and local projected diagonal at most 20 km.

Survey settings accept only these optional finite numeric fields:

| Field | Range | Default |
| --- | --- | --- |
| cameraAglM | 5–500 m | 50 |
| horizontalFovDeg | 10–150° | 60 |
| verticalFovDeg | 10–120° | 45 |
| sideOverlap | 0–0.95 | 0.7 |
| frontOverlap | 0–0.95 | 0.75 |
| relativeHomeAltitudeM | 1–500 m | 50 |
| speedMps | 0.1–100 m/s | 5 |
| batteryMinutes | 1–1440 min | 25 |
| reservePercent | 0–90% | 20 |

Invalid explicit values, unknown keys, and booleans fail. Ideal flat-ground footprint is `2 × assumed AGL × tan(FOV / 2)`. Sweep spacing is `footprint width × (1 − side overlap)`, limited to 1–1000 m. Suggested sampling distance is `footprint length × (1 − front overlap)`. No camera trigger is commanded.

Camera assumed AGL is independent of waypoint altitude relative to home. No terrain, geoid, or ellipsoid conversion is performed. The report uses 2D GeoJSON; relative-home altitude is a property/waypoint field. Time is geometric distance divided by assumed constant speed. Battery percentage is that time divided by full nominal battery duration; reserve reduces available time. These are model estimates, not energy measurements or flight approval.

The route is OPEN. Home-to-first and last-to-home connectors, takeoff, landing, and RTL are not generated. Holes protect only the mathematical centreline, not camera footprint, vehicle clearance, tracking error, or a vehicle geofence. Vehicle waypoint acceptance and turns may deviate from the line. The export does not set speed or command a camera.

## QGC WPL 110 subset

This is the legacy de-facto ground-station text format, not an official MAVLink protocol/file standard. Header is `QGC WPL 110`, followed by exactly 12 tab-separated numeric fields per row: sequence, current, frame, command, param1, param2, param3, param4, param5 (latitude), param6 (longitude), param7 (altitude), autoContinue. Limit: 2,001 rows and 1 MiB, without blank interior lines or nonfinite fields.

The parser validates every row and field. It supports command 16 only; frame 0 (AMSL) or 3 (relative-home); contiguous integer sequence from 0; current 1 on row 0 and 0 elsewhere; autoContinue 1. Parameter ranges: hold 0–3600 s, acceptance 0–1000 m, pass radius exactly 0, finite yaw −180–360°, latitude ±90°, longitude ±180°, altitude −500–10000 m. Unsupported commands, frames, or semantics fail clearly. This parser is not a general mission editor.

QGroundControl's WPL 110 importer consumes row 0 as planned-home metadata. Export requires an explicit home object with exactly `lat`, `lon`, and `altitudeAmslM`: home latitude ±80°, longitude ±180°, AMSL altitude −500–10000 m. Home can lie outside the polygon because it is metadata; no connecting route is assumed. The home row uses frame 0; geometric route points use frame 3 and the configured relative-home altitude. Parameters 1–3 are 0. Yaw is the initial bearing to the next geometric point; the final yaw is retained from the preceding leg. This does not control a gimbal. Acceptance 0 leaves vehicle-specific behaviour; no clearance is certified.

Serialization validates the whole supported mission and preserves numeric values on semantic parse→serialize→parse round trips. Export generation re-plans from the validated polygon/settings; it does not trust an externally edited report. File syntax validation alone cannot establish polygon containment because the legacy file does not include the source polygon/geofence.

## CLI and browser

`plan AREA --out NEW_DIR [--settings JSON] [--home JSON]` writes `plan.json` and `route.geojson`, plus `survey.waypoints` when explicit home data is supplied. The destination must not exist and its parent must exist. Inputs must be bounded regular UTF-8 files. No overwrite or network connection occurs. `check FILE` prints a format/frame summary as JSON. Exit codes: 0 success, 2 invalid input, 1 I/O or runtime failure.

The browser reads local GeoJSON or lets users draw closed rings on a clearly labeled local coordinate grid. It shows the same core's route and assumptions. WPL download requires explicit home values. A strict public-file development server binds to loopback; only static app/modules/fixtures are served. No vehicle API, upload service, telemetry, map tiles, or external runtime assets exist.

The library WPL serializer requires a dense array of supported rows. Missing array elements are invalid rows; they cannot be serialized as blank lines. This applies before writing any output, and valid supported rows retain parse/serialize round trips.
