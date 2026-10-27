# Geometry, camera assumptions, and export semantics

## Shared geometry owner

This application vendors the pure Qeth mission core at commit `fda093afd02e5bb4066d5b083a50c623aad6a228`. The two source files and MIT license are byte-for-byte copies. [UPSTREAM.json](../vendor/qeth/UPSTREAM.json) records SHA-256 hashes and the test import adaptation. Provenance tests check source hashes. Qeth owns future geometry fixes; update the pinned copy after upstream review rather than maintain two independent solvers. No registry package or global installation is required.

The solver uses a local equirectangular projection on a spherical Earth with radius 6,371,008.8 m. It checks closed simple rings, non-touching interior holes, and complete survey/transit segments. Horizontal and vertical boustrophedon sweeps are compared. A visibility graph finds valid connectors through a concave polygon and around holes. The shorter feasible candidate is selected. This is a two-direction heuristic, not proof of global optimality or complete camera coverage.

The core limits requests to 1,000 ring positions in total, projected diagonal at most 20 km, latitude within ±80°, no antimeridian crossing, 8,000,000 geometric work units, and 1,000 survey legs. This application limits output to 2,000 route points. The JSON loader rejects input above 512 KiB, depth 32, or 50,000 nodes before planning. Excessive or invalid requests fail; they are not silently simplified.

Projection distance is an approximation. There is no terrain, ellipsoid height, geoid, obstacle database, vehicle envelope, or clearance buffer. A hole constrains only the mathematical centreline. Tracking error, waypoint acceptance, turns, and a camera footprint can cross that boundary. A downloaded waypoint file does not carry these holes as a geofence.

## Camera and time model

For an ideal nadir camera over flat ground, half the footprint is the opposite side of a right triangle. Thus `footprint = 2 × assumed AGL × tan(FOV / 2)`. Horizontal FOV sets footprint width; vertical FOV sets length. Sweep spacing is `width × (1 − side overlap)`. Suggested along-track sampling distance is `length × (1 − front overlap)`. The latter is a suggestion in the report, not a trigger command. Boundary strips and the entire footprint are not certified as covered.

Camera AGL is an independent input. Waypoint altitude is relative to home. The application does not infer either value from the other and does not convert height systems.

Time is `route distance / assumed speed`. Estimated battery percentage is `time / (nominal battery minutes × 60) × 100`. Usable time is `nominal duration × (1 − reserve percent / 100)`. These denominators are distinct. This is a nominal duration model, not a power, current, voltage, or measured energy model. Wind, climb, acceleration, turns, home travel, takeoff, and landing are absent.

## WPL text format

The [MAVLink file-format guide](https://mavlink.io/en/file_formats/) describes the legacy ground-station text convention. WPL is a de-facto format, not an official MAVLink file standard. This project exports `QGC WPL 110`, not QGroundControl `.plan` JSON and not a live MAVLink message stream. Its strict subset is specified in [contract.md](contract.md). A one-row numeric excerpt from the guide is kept with source metadata in `fixtures/`; tests preserve field order and semantic parse/serialize round trips.

The seven parameters follow [MAV_CMD_NAV_WAYPOINT](https://mavlink.io/en/messages/common.html#MAV_CMD_NAV_WAYPOINT). All 12 file fields are validated: sequence, flags, command, frames, coordinates, and numeric ranges. Only command 16 is accepted. Exports set hold time, acceptance radius, and pass radius to zero. Yaw is the finite bearing toward the next point; the last point retains the preceding bearing. This does not set a gimbal, speed, or camera trigger. Vehicle-specific waypoint behaviour still needs review.

The [MAVLink frame definitions](https://mavlink.io/en/messages/common.html#MAV_FRAME) distinguish frame 0 (global, altitude AMSL) from frame 3 (global, altitude relative to home). Export row 0 contains explicit planned-home position and AMSL altitude in frame 0. All following route rows use frame 3 with the configured relative-home height. There is no inferred terrain-relative frame or height conversion.

The planned-home rule is checked against [QGroundControl's `_loadTextMissionFile`, pinned revision 98ee79c1cf3c173e22939bade6ddf06376f78e13](https://github.com/mavlink/qgroundcontrol/blob/98ee79c1cf3c173e22939bade6ddf06376f78e13/src/MissionManager/MissionController.cc#L768). Its WPL 110 loader consumes the first row as home metadata. No home-to-route connector is inferred here. The supported parser can inspect frame 0 or 3 navigation rows; this generator always uses 3 for route points.

No QGroundControl application import, PX4 SITL session, autopilot connection, hardware test, or real flight was performed. File checks prove the supported syntax and recorded semantics. They do not prove that a vehicle can execute the route. The [PX4 mission guide](https://docs.px4.io/main/en/flying/missions) describes the wider planning and operating context.

## Reproducible example

The polygon, hole, and home in `examples/` are synthetic. Home is deliberately outside the polygon; it is metadata, not a validated connector. Its 900 m AMSL value is invented fixture data, not a measured site altitude. Run `npm run demo` to reproduce all five committed outputs byte-for-byte. It runs the compiled CLI, parses generated WPL rows, checks frames and altitude values, and regenerates the SVG from actual route legs. `npm run demo:update` refreshes those artifacts after a reviewed algorithm change.

The cover is approved AI-generated concept artwork. The route figure and numeric report are program output. Neither is evidence of a physical build or flight.
