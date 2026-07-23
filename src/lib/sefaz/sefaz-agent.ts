import type { CertificateTls } from "@/lib/sefaz/cert-store";
import type { Agent } from "https";

export async function resolveSefazAgent(tls: CertificateTls): Promise<Agent> {
  const { createPemHttpsAgent, createPfxHttpsAgent } = await import(
    "@/lib/sefaz/pfx-tls"
  );
  if (tls.mode === "pem") {
    return createPemHttpsAgent({ key: tls.key, cert: tls.cert });
  }
  return createPfxHttpsAgent(tls.pfx, tls.passphrase);
}
