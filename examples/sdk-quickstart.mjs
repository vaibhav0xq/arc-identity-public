#!/usr/bin/env node
/* Same check through the TypeScript SDK. Build it once first:

     cd sdk/typescript
     npm install
     npm run build

   Then run from the repository root:

     node examples/sdk-quickstart.mjs */

import { Kyro, KyroApiError } from "../sdk/typescript/dist/index.js";

const kyro = new Kyro(process.env.KYRO_API_KEY ? { apiKey: process.env.KYRO_API_KEY } : {});

try {
  const decision = await kyro.decisions.check("0x1234567890abcdef1234567890abcdef12345678", {
    useCase: "escrow"
  });
  console.log(`Verdict ${decision.decision.toUpperCase()} (score ${decision.score ?? "n/a"})`);
  console.log(`Limit   ${decision.recommendedLimit.amountUsdc} ${decision.recommendedLimit.currency}`);
  for (const reason of decision.reasons ?? []) console.log(`  ${reason.code}: ${reason.message}`);
} catch (error) {
  if (error instanceof KyroApiError) {
    console.error(`API error ${error.status}: ${error.code} ${error.message}`);
    process.exit(1);
  }
  throw error;
}
