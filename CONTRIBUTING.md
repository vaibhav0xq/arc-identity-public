# Contributing to Kyro

Thanks for your interest in improving Kyro. This repository contains the public surface of the platform: the app frontend, the TypeScript SDK, the OpenAPI contract, the docs site and runnable examples. The engine behind the API is developed privately and runs in the hosted service, so contributions here focus on the public pieces.

## What fits here

- App surface improvements: UI, accessibility, copy fixes, performance.
- SDK improvements: ergonomics, tests, documentation.
- Docs and examples: corrections, clarity, new examples.
- Bug reports for anything you can reproduce on www.thekyro.co or in this repository.

The v1 API contract in `public/kyro-openapi.yaml` is frozen. Contract changes ship from the platform release process together with regenerated SDK types, so please open an issue instead of a pull request for spec changes.

## Local setup

1. Fork and clone the repository.
2. Install dependencies with `npm install`. Node.js 20 or later is required.
3. Start the dev server with `npm run dev` and open `http://localhost:3000`. API calls are proxied to the hosted service, so no keys or databases are needed.

## Before you open a pull request

Run the checks reviewers will expect to pass:

```bash
npm run typecheck
npm run test:intake-pacing
```

If your change touches the SDK, also run its checks from `sdk/typescript`:

```bash
npm run typecheck
npm test
npm run build
```

If your change touches the docs site, make sure `npm run build` passes in `docs-site`.

## Conventions

### Code

- TypeScript throughout. No untyped escape hatches unless there is no alternative and a comment explains why.
- Shared logic lives in `lib/`. Pages in `app/` stay thin and delegate to it.
- UI components live in `components/` and follow the existing editorial design system. Reuse the established palette, hairline rules and typography instead of introducing new visual primitives.

### Copy and content

- User facing copy avoids long dashes and avoids a comma before `and` or `or`.
- Keep product surfaces free of explanatory prose. Detailed explanations belong on the docs site.

## Commit and pull request guidelines

- Keep commits focused. One logical change per commit.
- Write commit messages in plain imperative English, for example `Add copy button to the receipt page`.
- In the pull request description explain what changed, why and how you verified it. Screenshots are appreciated for UI changes.
- Link the issue the pull request addresses if one exists.

## Reporting bugs and requesting features

Open a GitHub issue with a clear title and enough detail to reproduce or evaluate the request. For anything security sensitive follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.
