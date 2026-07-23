import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { readFile, unlink, writeFile } from "fs/promises";
import https from "https";
import forge from "node-forge";

const execFileAsync = promisify(execFile);

export type PemBundle = {
  key: string;
  cert: string;
  ca?: string[];
};

function splitPemBlocks(pem: string): string[] {
  const blocks: string[] = [];
  const re = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pem))) blocks.push(m[0].trim());
  return blocks;
}

/** Extrai PEM via node-forge (evita PKCS#12 nativo do Node/OpenSSL 3). */
function forgePfxToPem(pfx: Buffer, password: string): PemBundle {
  const der = forge.util.createBuffer(pfx.toString("binary"));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  const certBags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ??
    [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
    [];

  const certObj = certBags[0]?.cert;
  const keyObj = keyBags[0]?.key;
  if (!certObj || !keyObj) {
    throw new Error("PFX sem chave privada ou certificado utilizável.");
  }

  const certs = certBags
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c))
    .map((c) => forge.pki.certificateToPem(c));

  return {
    key: forge.pki.privateKeyToPem(keyObj),
    cert: certs[0],
    ca: certs.length > 1 ? certs.slice(1) : undefined,
  };
}

async function opensslPkcs12(
  pfxPath: string,
  outPath: string,
  passPath: string,
  extraArgs: string[],
): Promise<void> {
  await execFileAsync(
    "openssl",
    [
      "pkcs12",
      "-in",
      pfxPath,
      "-nodes",
      "-passin",
      `file:${passPath}`,
      "-out",
      outPath,
      ...extraArgs,
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );
}

async function opensslPfxToPem(
  pfx: Buffer,
  password: string,
): Promise<PemBundle> {
  const id = randomUUID();
  const pfxPath = join(tmpdir(), `a1-${id}.pfx`);
  const outPath = join(tmpdir(), `a1-${id}.pem`);
  const passPath = join(tmpdir(), `a1-${id}.pass`);
  await writeFile(pfxPath, pfx);
  await writeFile(passPath, password, "utf8");

  const attempts: string[][] = [["-legacy"], []];
  let lastError: Error | null = null;

  try {
    for (const extra of attempts) {
      try {
        await opensslPkcs12(pfxPath, outPath, passPath, extra);
        lastError = null;
        break;
      } catch (e) {
        const err = e as { stderr?: Buffer; message?: string };
        lastError = new Error(
          (err.stderr?.toString() || err.message || String(e)).trim(),
        );
      }
    }
    if (lastError) {
      const msg = lastError.message || String(lastError);
      if (/mac verify|invalid password|password/i.test(msg)) {
        throw new Error("Senha do certificado A1 incorreta.");
      }
      throw new Error(msg.slice(0, 200));
    }

    const pem = await readFile(outPath, "utf8");
    const blocks = splitPemBlocks(pem);
    const key = blocks.find((b) => /PRIVATE KEY/.test(b));
    const certs = blocks.filter((b) => /CERTIFICATE/.test(b));
    if (!key || certs.length === 0) {
      throw new Error("PFX convertido, mas sem chave/certificado utilizáveis.");
    }
    return {
      key,
      cert: certs[0],
      ca: certs.length > 1 ? certs.slice(1) : undefined,
    };
  } finally {
    await unlink(pfxPath).catch(() => undefined);
    await unlink(outPath).catch(() => undefined);
    await unlink(passPath).catch(() => undefined);
  }
}

/**
 * Converte A1 (.pfx) → PEM para mTLS.
 * 1) node-forge (A1 BR / RC2 legado)
 * 2) OpenSSL `-legacy` / padrão
 */
export async function pfxToPemBundle(
  pfx: Buffer,
  password: string,
): Promise<PemBundle> {
  try {
    return forgePfxToPem(pfx, password);
  } catch (forgeErr) {
    try {
      return await opensslPfxToPem(pfx, password);
    } catch (opensslErr) {
      const a =
        forgeErr instanceof Error ? forgeErr.message : String(forgeErr);
      const b =
        opensslErr instanceof Error ? opensslErr.message : String(opensslErr);
      if (/senha|password|mac verify/i.test(a + b)) {
        throw new Error("Senha do certificado A1 incorreta.");
      }
      throw new Error(
        "Não foi possível ler o .pfx (PKCS#12). Confira a senha ou reexporte o A1. " +
          (b || a).slice(0, 160),
      );
    }
  }
}

/** Agent mTLS sem carregar PKCS#12 nativo do Node (evita Unsupported PKCS12 PFX data). */
export async function createPfxHttpsAgent(
  pfx: Buffer,
  passphrase: string,
): Promise<https.Agent> {
  const bundle = await pfxToPemBundle(pfx, passphrase);
  // Cadeia do cliente = leaf + intermediários no `cert`.
  // NÃO passar intermediários em `ca` — isso substitui a trust store e quebra
  // a verificação do servidor (unable to get local issuer certificate).
  const certChain = [bundle.cert, ...(bundle.ca ?? [])].join("\n");
  return new https.Agent({
    key: bundle.key,
    cert: certChain,
    // SEFAZ/ADN usam cadeias ICP-Brasil/Serpro; no container Node costuma
    // falhar a verificação do peer. mTLS do A1 continua obrigatório.
    rejectUnauthorized: false,
  });
}
