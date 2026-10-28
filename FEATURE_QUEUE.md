# Feature queue

Delivered 28 October 2026: reject sparse mission-row arrays before serialization. A missing JavaScript array element can no longer skip row validation and produce blank invalid WPL rows. Valid supported files retain exact parse/serialize round trips.

Next useful work:
Delivered final round: `check FILE` and `wplAltitudeSummary` report per-waypoint metadata-derived AMSL altitudes and bounds for mixed supported frames. Coordinate extremes round-trip without swaps or changes; home-only files report null navigation bounds. No terrain/AGL conversion is inferred.

- Calculate camera-footprint overlap under the documented flat-ground assumptions.
- Validate explicit terrain/altitude references before adding terrain-aware export.

Exports remain offline. Valid WPL syntax does not establish vehicle or flight acceptance.
