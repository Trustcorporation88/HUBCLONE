import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { readFile, unlink, writeFile } from "fs/promises";
import { readFileSync } from "fs";
import https from "https";
import tls from "tls";
import forge from "node-forge";

const execFileAsync = promisify(execFile);

export type PemBundle = {
  key: string;
  /** Leaf + intermediários (PEM concatenado), ordem correta para mTLS. */
  cert: string;
};

function splitPemBlocks(pem: string): string[] {
  const blocks: string[] = [];
  const re = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pem))) blocks.push(m[0].trim());
  return blocks;
}

function rsaKeyMatchesCert(
  key: forge.pki.PrivateKey,
  cert: forge.pki.Certificate,
): boolean {
  try {
    const pub = cert.publicKey as forge.pki.rsa.PublicKey;
    const priv = key as forge.pki.rsa.PrivateKey;
    if (!pub?.n || !priv?.n || !pub?.e || !priv?.e) return false;
    return pub.n.compareTo(priv.n) === 0 && pub.e.compareTo(priv.e) === 0;
  } catch {
    return false;
  }
}

function buildCertChainPem(
  leaf: forge.pki.Certificate,
  all: forge.pki.Certificate[],
): string {
  const leafPem = forge.pki.certificateToPem(leaf);
  const rest = all
    .filter((c) => c !== leaf)
    .map((c) => forge.pki.certificateToPem(c));
  return [leafPem, ...rest].join("\n");
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

  const keyObj = keyBags[0]?.key;
  const certObjs = certBags
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));

  if (!keyObj || certObjs.length === 0) {
    throw new Error("PFX sem chave privada ou certificado utilizável.");
  }

  const leaf =
    certObjs.find((c) => rsaKeyMatchesCert(keyObj, c)) ?? certObjs[0];

  return {
    key: forge.pki.privateKeyToPem(keyObj),
    cert: buildCertChainPem(leaf, certObjs),
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
      cert: certs.join("\n"),
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

export function mapTlsError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/unable to get local issuer certificate/i.test(msg)) {
    // Os certificados atuais da SEFAZ (NF-e/CT-e) são emitidos por AC pública
    // (ex.: GlobalSign), já confiável no store padrão do Node — por isso o
    // bundle ICP-Brasil embarcado (certs/icp-brasil-ca-bundle.pem, usado
    // automaticamente quando SEFAZ_CA_BUNDLE_PATH não está definido) resolve
    // a maioria dos casos. Se ainda assim falhar, é rede/proxy/egress
    // bloqueando ou reescrevendo o TLS — não um CA ausente no app.
    const usingBundle = loadExtraCa().length > 0;
    return (
      `Falha TLS com a SEFAZ: não foi possível validar a cadeia de certificado do servidor` +
      `${usingBundle ? " mesmo com o bundle de CAs carregado" : " (bundle de CAs não carregado)"}.` +
      ` Verifique se a rede/proxy de saída não está interceptando TLS (MITM) e, se persistir,` +
      ` contate o suporte com este detalhe: "${msg.slice(0, 200)}". NÃO contorne desativando a verificação do peer.`
    );
  }
  if (/unsupported pkcs12|pkcs12 pfx/i.test(msg)) {
    return "Formato do .pfx incompatível. Reexporte o A1 e cadastre de novo.";
  }
  if (/certificate has expired|cert.*expir/i.test(msg)) {
    return "Certificado A1 vencido. Renove o certificado digital.";
  }
  if (/mac verify|invalid password|senha/i.test(msg)) {
    return "Senha do certificado A1 incorreta.";
  }
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|Timeout/i.test(msg)) {
    return "SEFAZ indisponível ou rede instável. Aguarde e tente novamente.";
  }
  return msg;
}

let extraCaCache: string[] | null = null;

/**
 * Cadeia raiz ICP-Brasil (AC-Raiz + intermediárias usadas pela SEFAZ/ADN).
 * O bundle padrão do Node (Mozilla) NÃO inclui a ICP-Brasil, causando
 * "unable to get local issuer certificate" mesmo com o servidor legítimo.
 *
 * Ordem de resolução:
 * 1. SEFAZ_CA_BUNDLE_PATH (se configurado no .env)
 * 2. certs/icp-brasil-ca-bundle.pem embarcado no repo (gerado do
 *    ACcompactado.zip oficial do ITI — scripts/build-icp-bundle.mjs)
 *
 * NUNCA desative a verificação do peer (rejectUnauthorized) como "solução" —
 * isso permite que qualquer atacante na rede se passe pela SEFAZ.
 */
function loadExtraCa(): string[] {
  if (extraCaCache) return extraCaCache;
  const candidates = [
    process.env.SEFAZ_CA_BUNDLE_PATH?.trim(),
    join(process.cwd(), "certs", "icp-brasil-ca-bundle.pem"),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    try {
      const pem = readFileSync(path, "utf8");
      const blocks = splitPemBlocks(pem).filter((b) => /CERTIFICATE/.test(b));
      if (blocks.length > 0) {
        extraCaCache = blocks;
        return extraCaCache;
      }
    } catch {
      // tenta o próximo candidato
    }
  }
  extraCaCache = [];
  return extraCaCache;
}

function agentFromPem(bundle: PemBundle): https.Agent {
  // Cadeia do cliente (mTLS) = leaf + intermediários do A1, em `cert`.
  // A verificação do SERVIDOR usa `ca` = raízes padrão do Node + ICP-Brasil
  // (se configurada) — nunca `rejectUnauthorized: false`.
  const extraCa = loadExtraCa();
  const secureContext = tls.createSecureContext({
    key: bundle.key,
    cert: bundle.cert,
    ca: extraCa.length > 0 ? [...tls.rootCertificates, ...extraCa] : undefined,
  });
  return new https.Agent({
    secureContext,
    rejectUnauthorized: true,
    keepAlive: false,
    maxCachedSessions: 0,
  });
}

/** Agent mTLS a partir de PEM já extraído (preferido — sem reparse do PFX). */
export function createPemHttpsAgent(bundle: PemBundle): https.Agent {
  return agentFromPem(bundle);
}

/** Agent mTLS a partir do .pfx (converte internamente). */
export async function createPfxHttpsAgent(
  pfx: Buffer,
  passphrase: string,
): Promise<https.Agent> {
  const bundle = await pfxToPemBundle(pfx, passphrase);
  return agentFromPem(bundle);
}

/** Valida que o A1 gera material TLS utilizável (chamado no upload). */
export async function assertPfxTlsReady(
  pfx: Buffer,
  password: string,
): Promise<PemBundle> {
  const bundle = await pfxToPemBundle(pfx, password);
  // Força createSecureContext — falha cedo se key/cert não casam
  tls.createSecureContext({ key: bundle.key, cert: bundle.cert });
  return bundle;
}
