# Kyro Docs

Standalone documentation site for the Kyro Counterparty Decision API, built with [Fumadocs](https://fumadocs.dev) on Next.js. Intended to be deployed as its own Vercel project (Root Directory: `docs-site`) and served at docs.thekyro.co.

## Development

```bash
npm install
npm run dev
```

## Content

- Hand-written pages live in `content/docs/*.mdx`.
- `content/docs/api-reference/*.mdx` (except `index.mdx` and `meta.json`) is generated from the frozen v1 contract at `../public/kyro-openapi.yaml`. Never edit the spec from this app. Regenerate with:

```bash
npx -y tsx scripts/generate-docs.ts
```

## Writing rules

No em or en dashes, no serial commas, no unicode ellipses. Copy is ported from the approved developer page on www.thekyro.co; keep the two in sync when the contract changes.
