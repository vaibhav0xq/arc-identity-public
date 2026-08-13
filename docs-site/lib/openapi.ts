import { createOpenAPI } from 'fumadocs-openapi/server';

// Source of truth: the frozen v1 contract at the repo root.
// Do not edit the spec from this app.
export const openapi = createOpenAPI({
  input: ['../public/kyro-openapi.yaml'],
});
