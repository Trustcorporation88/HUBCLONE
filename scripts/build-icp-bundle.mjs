/**
 * Gera certs/icp-brasil-ca-bundle.pem a partir dos .crt extraídos do
 * ACcompactado.zip oficial do ITI (https://acraiz.icpbrasil.gov.br).
 *
 * Aceita certificados em DER (binário) ou PEM. Uso:
 *   node scripts/build-icp-bundle.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const SRC_DIR = join(process.cwd(), "certs", "ac-raw");
const OUT_FILE = join(process.cwd(), "certs", "icp-brasil-ca-bundle.pem");

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else if (/\.(crt|cer|pem)$/i.test(name)) out.push(p);
  }
  return out;
}

function toPem(buf, filename) {
  const text = buf.toString("utf8");
  if (text.includes("-----BEGIN CERTIFICATE-----")) {
    // Já é PEM — extrai apenas os blocos de certificado
    const blocks = text.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    );
    return blocks ? blocks.join("\n") : null;
  }
  // DER binário → base64 com quebras de 64 colunas
  if (buf.length < 100 || buf[0] !== 0x30) {
    console.warn(`ignorado (não parece certificado): ${filename}`);
    return null;
  }
  const b64 = buf.toString("base64").replace(/(.{64})/g, "$1\n").trim();
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
}

const files = listFiles(SRC_DIR);
const pems = [];
let converted = 0;
for (const f of files) {
  const pem = toPem(readFileSync(f), f);
  if (pem) {
    pems.push(`# ${f.split(/[\\/]/).pop()}`);
    pems.push(pem);
    converted += 1;
  }
}

writeFileSync(OUT_FILE, pems.join("\n") + "\n", "utf8");
console.log(`OK: ${converted}/${files.length} certificados → ${OUT_FILE}`);
