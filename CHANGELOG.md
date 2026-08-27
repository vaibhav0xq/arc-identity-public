# Changelog

Notable changes to the public Kyro repository. The hosted service ships continuously; this file tracks what is published here.

## Unreleased

Full refresh of the public mirror around the hosted Kyro platform.

- Replaced the legacy full app mirror with a curated surface: the current app frontend, client safe libraries, the frozen v1 OpenAPI contract with its PDF edition, the TypeScript SDK, the docs site source and runnable API examples.
- Server internals (API routes, the scoring and decision pipeline, data providers and persistence) now run only in the hosted service and are no longer mirrored here.
- The receipt share page now reads from the public v1 receipts API.
- Local runs proxy API calls to the hosted service, so the app surface works without any server code in this repository.
- Added the MIT license with the brand asset carve out described in the README.
- Synced the app surface with the hosted service: a wallet network notice with one tap switch back to Ethereum, the dashboard interaction graph card and trust evidence strip, the public pricing page and the current check, landing and dashboard surfaces.

## v0.2.1 - 2026-08-09

Rebranded the public mirror to Kyro.

## v0.2.0 - 2026-08-06

Clarified the Arc positioning and refreshed the README.

## v0.1.2 - 2026-07-21

Documentation polish for the public repository.

## v0.1.1 - 2026-07-17

First public mirror of the app under the Arc Identity brand.
