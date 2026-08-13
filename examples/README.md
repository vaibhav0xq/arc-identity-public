# Kyro API examples

Small scripts that call the public Kyro API. Node.js 20 or later, no dependencies.

```bash
node examples/check-wallet.mjs 0x1234567890abcdef1234567890abcdef12345678 payment
node examples/batch-check.mjs 0x1234567890abcdef1234567890abcdef12345678 name.kyro
node examples/sdk-quickstart.mjs   # build sdk/typescript first, see the file header
```

All endpoints accept anonymous requests at 20 rate units per minute per IP. A single check costs 1 unit and a batch costs 1 unit per unique row. Set `KYRO_API_KEY` to use an API key with a higher budget. Full reference: https://docs.thekyro.co

Point `KYRO_API_ORIGIN` at a different deployment to test against it.
