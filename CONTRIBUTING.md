# Contributing

Use Node 22.18 or later. Install with `npm ci`, then run `npm run check` and `npm run demo`. Tests use the Node test runner. The viewer test needs permission to bind a temporary loopback port. No test requires a vehicle, network service, paid API key, or npm account after installation.

Write a focused failing test for changes to geometry, units, limits, or export fields. Preserve the exact vendored Qeth source and license. Send shared geometry changes to Qeth first, then update the pinned source and provenance together. Do not edit the vendored copy in isolation.

Use `npm run dev` for browser review. Check invalid inputs, stale export state, coordinate entry without a pointer, keyboard focus, narrow screens, and the distinction between camera AGL and relative-home waypoint height. Review the emitted static bundle for external resources and unintended file exposure.

Keep claims tied to evidence. Synthetic fixtures are not flights. A valid WPL file is not vehicle acceptance. Do not add an aircraft connection or automated upload without a separate reviewed design. Do not backdate commits or present generated illustrations as hardware photographs.

Submit a small pull request with the problem, resulting behaviour, and actual checks. Include fixture changes and the reason if model output changes. Do not commit dependency folders, raw logs, local exports, credentials, or caches.
