import type { NextConfig } from "next";

const CANONICAL_HOST =
  process.env.CANONICAL_HOST?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
  "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["node-forge"],
  async redirects() {
    if (!CANONICAL_HOST) return [];
    // Redirect legado contabil.trustcorp.com.br → office.procontador.com.br
    // (OS no BR = ordem de serviço; domínio canônico evita ambiguidade)
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "contabil.trustcorp.com.br" }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.contabil.trustcorp.com.br" }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
