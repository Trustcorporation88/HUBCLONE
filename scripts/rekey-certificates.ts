/**
 * Rekey do material cifrado: passa tudo que ainda está na chave antiga
 * (derivada do AUTH_SECRET) para a CERT_ENCRYPTION_KEY dedicada.
 *
 * QUANDO RODAR
 *
 *  - Uma vez, logo depois de configurar CERT_ENCRYPTION_KEY.
 *  - De novo, sempre que trocar a CERT_ENCRYPTION_KEY (aí exporte a anterior em
 *    CERT_ENCRYPTION_KEY_OLD, veja abaixo).
 *
 * COMO RODAR
 *
 *   AUTH_SECRET=... CERT_ENCRYPTION_KEY=... npx tsx scripts/rekey-certificates.ts
 *   (ou `npm run certs:rekey` com as variáveis já no ambiente)
 *
 * O AUTH_SECRET continua obrigatório aqui porque é ele que decifra o acervo
 * antigo. Depois que este script rodar limpo, o AUTH_SECRET pode ser rotacionado
 * sem levar os certificados junto — que é o ponto de toda a mudança.
 *
 * SEGURANÇA
 *
 * O script nunca imprime chave, senha ou conteúdo de certificado. Só conta
 * quantos registros converteu. Ele é idempotente: rodar duas vezes não faz mal,
 * a segunda passada não encontra nada em formato antigo.
 */

import { PrismaClient } from "@prisma/client";
import {
  decryptSecret,
  encryptSecret,
  isLegacyPayload,
} from "../src/lib/crypto-secret";

const prisma = new PrismaClient();

/** Reconverte um campo, se ele existir e ainda estiver no formato antigo. */
function reencrypt(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  if (!isLegacyPayload(value)) return value; // já está em v2
  return encryptSecret(decryptSecret(value));
}

async function main() {
  if (!process.env.CERT_ENCRYPTION_KEY?.trim()) {
    throw new Error(
      "CERT_ENCRYPTION_KEY não definida. Sem ela não há para onde converter.",
    );
  }

  const certificados = await prisma.certificate.findMany({
    select: {
      id: true,
      cnpj: true,
      pfxEnc: true,
      pemKeyEnc: true,
      pemCertEnc: true,
      passwordEnc: true,
    },
  });

  let convertidos = 0;
  let jaOk = 0;
  const falhas: Array<{ cnpj: string; motivo: string }> = [];

  for (const cert of certificados) {
    const precisa =
      isLegacyPayload(cert.passwordEnc || "") ||
      (cert.pfxEnc && isLegacyPayload(cert.pfxEnc)) ||
      (cert.pemKeyEnc && isLegacyPayload(cert.pemKeyEnc)) ||
      (cert.pemCertEnc && isLegacyPayload(cert.pemCertEnc));

    if (!precisa) {
      jaOk += 1;
      continue;
    }

    try {
      await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          pfxEnc: reencrypt(cert.pfxEnc) ?? null,
          pemKeyEnc: reencrypt(cert.pemKeyEnc) ?? null,
          pemCertEnc: reencrypt(cert.pemCertEnc) ?? null,
          passwordEnc: reencrypt(cert.passwordEnc) ?? cert.passwordEnc,
        },
      });
      convertidos += 1;
    } catch (e) {
      // Falha aqui quase sempre significa que o AUTH_SECRET atual não é o mesmo
      // com que aquele registro foi cifrado. O certificado precisa ser enviado
      // de novo pela tela de XML — não há como recuperar sem a chave original.
      falhas.push({
        cnpj: cert.cnpj,
        motivo: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Credenciais de integração usam a mesma cifra.
  const integracoes = await prisma.integration.findMany({
    select: { id: true, provider: true, credentialsEnc: true },
  });
  let integracoesConvertidas = 0;
  for (const row of integracoes) {
    if (!row.credentialsEnc || !isLegacyPayload(row.credentialsEnc)) continue;
    try {
      await prisma.integration.update({
        where: { id: row.id },
        data: { credentialsEnc: encryptSecret(decryptSecret(row.credentialsEnc)) },
      });
      integracoesConvertidas += 1;
    } catch (e) {
      falhas.push({
        cnpj: `integração ${row.provider}`,
        motivo: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(
    `Certificados: ${convertidos} convertido(s), ${jaOk} já na chave nova.`,
  );
  console.log(`Integrações: ${integracoesConvertidas} convertida(s).`);

  if (falhas.length > 0) {
    console.error(
      `\n${falhas.length} registro(s) NÃO puderam ser convertidos — provavelmente cifrados com outro AUTH_SECRET:`,
    );
    for (const f of falhas) console.error(`  - ${f.cnpj}: ${f.motivo}`);
    console.error(
      "\nEsses precisam ser cadastrados de novo (envio do .pfx pela tela de XML).",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
