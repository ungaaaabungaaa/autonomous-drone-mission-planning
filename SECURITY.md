# Security

This tool has no vehicle connection or hosted upload service. Local files stay in the browser when using the viewer. The development server binds to 127.0.0.1 and serves only a fixed public bundle; it is not a production multi-user server. It rejects unknown hosts, write methods, non-public paths, and oversized files. Input and geometry work are bounded, but planning remains synchronous and a difficult allowed input can briefly block the browser.

Reports and waypoint files can reveal exact coordinates. Review them before sharing. The browser has no analytics, map tiles, external fonts, or remote scripts. Installing development dependencies still contacts the configured npm registry.

The planner checks mathematical route centrelines. It cannot establish clearance, flight legality, airworthiness, terrain height, actual battery endurance, or vehicle acceptance. Never interpret a successful file check as authority to operate an aircraft.

Report a vulnerability through this repository's private GitHub security reporting feature if available. Otherwise open an issue with a general description and request a private reporting route; omit secrets and sensitive coordinates. No response-time guarantee is offered.
