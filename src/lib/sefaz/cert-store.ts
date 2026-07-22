import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import forge from "node-forge";
import { onlyDigits } from "@/lib/crypto-secret";

const ROOT = path.join(process.cwd(), "data");

export function certsDir(firmId: string) {
  return path.join(ROOT, "certs", firmId);
}

export function xmlDir(firmId: string, clientId: string) {
  return path.join(ROOT, "xml", firmId, clientId);
}

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export type PfxInfo = {
  subjectCn: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  cnpjFromCert: string | null;
};

export function inspectPfx(pfxBuffer: Buffer, password: string): PfxInfo {
  const der = forge.util.createBuffer(pfxBuffer.toString("binary"));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  const bags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ??
    [];
  const cert = bags[0]?.cert;
  if (!cert) {
    throw new Error("Certificado A1 sem certificado utilizável no .pfx");
  }

  const subjectCn =
    cert.subject.getField("CN")?.value?.toString() ??
    cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(", ");

  let cnpjFromCert: string | null = null;
  const cnDigits = onlyDigits(subjectCn ?? "");
  if (cnDigits.length >= 14) cnpjFromCert = cnDigits.slice(0, 14);

  return {
    subjectCn,
    validFrom: cert.validity.notBefore
      ? new Date(cert.validity.notBefore)
      : null,
    validTo: cert.validity.notAfter ? new Date(cert.validity.notAfter) : null,
    cnpjFromCert,
  };
}

export async function savePfxFile(
  firmId: string,
  cnpj: string,
  buffer: Buffer,
): Promise<string> {
  const dir = certsDir(firmId);
  await ensureDir(dir);
  const filePath = path.join(dir, `${onlyDigits(cnpj)}.pfx`);
  await writeFile(filePath, buffer);
  return filePath;
}

export async function saveXmlFile(
  firmId: string,
  clientId: string,
  accessKey: string,
  xml: string,
): Promise<string> {
  const dir = xmlDir(firmId, clientId);
  await ensureDir(dir);
  const filePath = path.join(dir, `${accessKey}.xml`);
  await writeFile(filePath, xml, "utf8");
  return filePath;
}

export async function readPfx(filePath: string) {
  return readFile(filePath);
}
