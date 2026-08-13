/** @type {import('next').NextConfig} */

/* This repository ships the Kyro app surface; the API runs in the hosted
   service. Point KYRO_API_ORIGIN at a different deployment to test against
   it. */
const KYRO_API_ORIGIN = (process.env.KYRO_API_ORIGIN || "https://www.thekyro.co").replace(/\/$/, "");

const nextConfig = {
  /* Main-site /docs lives on the docs subdomain. Exact-path redirect only:
     /docs/Kyro-OpenAPI-Spec.pdf and other public/docs assets must keep serving. */
  async redirects() {
    return [
      {
        source: "/docs",
        destination: "https://docs.thekyro.co",
        permanent: false,
      },
    ];
  },
  /* Proxy API calls to the hosted service so the surface works out of the
     box: the check workbench, receipts and wallet flows all call /api/... on
     the same origin. */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${KYRO_API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
