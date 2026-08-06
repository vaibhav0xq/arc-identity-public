# Contributing to Arc Identity

Thanks for your interest in improving Arc Identity. This document covers how to get a working setup, what conventions the codebase follows and how changes get reviewed.

## Getting set up

1. Fork and clone the repository.
2. Install dependencies with `npm install`. Node.js 20 or later is required.
3. Copy the environment template from the README into `.env.local` and fill in your own keys. Supabase credentials and at least one RPC provider are needed for a meaningful local run.
4. Start the dev server with `npm run dev` and open `http://localhost:3000`.

## Before you open a pull request

Run the checks that CI and reviewers will expect to pass:

```bash
npm run typecheck
npm run test:score-contract
```

If your change touches the scoring pipeline also run:

```bash
npm run test:score-api
```

## Conventions

### Code

- TypeScript throughout. No untyped escape hatches unless there is no alternative and a comment explains why.
- Core logic lives in `lib/`. Pages and API routes in `app/` should stay thin and delegate to it.
- UI components live in `components/` and follow the existing editorial design system. Reuse the established palette, hairline rules and typography instead of introducing new visual primitives.

### Scoring model

The score model is a versioned contract. `arc_score_v2_2026_07` and the caps in `lib/score-contract.ts` are load bearing across the API, the database and the docs.

- Never change component caps, weights or penalties without bumping the model version.
- Never rename the model version string in one place only. It must stay consistent everywhere it appears.
- Determinism is a hard requirement. The same committed evidence must always produce the same score.

### Copy and content

- User facing copy avoids long dashes and avoids a comma before `and` or `or`.
- Keep product surfaces free of explanatory prose. Detailed explanations belong in the docs page.

## Commit and pull request guidelines

- Keep commits focused. One logical change per commit.
- Write commit messages in plain imperative English, for example `Add chain coverage badges to the directory`.
- In the pull request description explain what changed, why and how you verified it. Screenshots are appreciated for UI changes.
- Link the issue the pull request addresses if one exists.

## Reporting bugs and requesting features

Open a GitHub issue with a clear title and enough detail to reproduce or evaluate the request. For anything security sensitive follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.
