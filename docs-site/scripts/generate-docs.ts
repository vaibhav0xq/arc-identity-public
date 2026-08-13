import { generateFiles } from 'fumadocs-openapi';
import { openapi } from '../lib/openapi';

// Regenerate the endpoint reference from ../public/kyro-openapi.yaml.
// Run from docs-site/: npx -y tsx scripts/generate-docs.ts
void generateFiles({
  input: openapi,
  output: './content/docs/api-reference',
  per: 'operation',
  includeDescription: true,
});
