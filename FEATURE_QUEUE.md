# Feature queue

Delivered 28 October 2026: reject sparse mission-row arrays before serialization. A missing JavaScript array element can no longer skip row validation and produce blank invalid WPL rows. Valid supported files retain exact parse/serialize round trips.

Next useful work:
- Expand round-trip fixtures for supported coordinate and altitude bounds.
- Calculate camera-footprint overlap under the documented flat-ground assumptions.
- Validate explicit terrain/altitude references before adding terrain-aware export.

Exports remain offline. Valid WPL syntax does not establish vehicle or flight acceptance.
