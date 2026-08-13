"use client";

import { useState } from "react";

/**
 * Guia do processo de XML, na própria tela.
 *
 * Existe porque o fluxo tem três coisas que não são óbvias e geram chamado:
 * por que o certificado não fica mais aqui, por que documento capturado às
 * vezes não serve para escriturar (resumo), e o que a auditoria bloqueia.
 */

type Passo = {
  n: number;
  titulo: string;
  corpo: string;
  detalhe?: string;
};

const PASSOS: Passo[] = [
  {
    n: 1,
    titulo: "O certificado A1 fica no ProContador",
    corpo:
      "Quem conversa com a SEFAZ é o ProContador (www.procontador.com.br). É lá que o .pfx de cada cliente é cadastrado, e é de lá que sai a consulta.",
    detalhe:
      "Dois sistemas consultando a mesma Distribuição DFe com o mesmo CNPJ se atrapalham: a SEFAZ trata consulta paralela como consumo indevido, responde cStat 656 e bloqueia aquele CNPJ por uma hora. Pior, cada sistema guarda seu próprio marcador de posição (NSU) e um pode consumir o documento que o outro ainda não gravou, fazendo nota sumir sem erro aparente. Por isso existe um dono só.",
  },
  {
    n: 2,
    titulo: "Capturar traz o que o ProContador já buscou",
    corpo:
      "O botão de captura dispara a busca no ProContador, lê o resultado e importa para cá, baixando o XML de cada documento novo. Documento já importado não duplica.",
    detalhe:
      "A resposta diz quantos entraram e quantos já existiam. Se aparecer 'sem XML completo', são documentos que ainda estão como resumo do lado de lá — veja o passo 3.",
  },
  {
    n: 3,
    titulo: "Resumo não é o documento",
    corpo:
      "Para nota emitida CONTRA o cliente, a SEFAZ entrega primeiro só o resumo: chave, emitente, valor e data. Sem itens, sem NCM, sem CFOP, sem impostos. Dá para saber que a nota existe; não dá para escriturar.",
    detalhe:
      "O XML completo só é liberado depois da manifestação do destinatário (evento 210210, Ciência da Operação). Ela é feita no ProContador, na tela de captura fiscal. Depois de manifestar, capture de novo aqui e o documento chega inteiro.",
  },
  {
    n: 4,
    titulo: "Auditar XML classifica o que entrou",
    corpo:
      "A auditoria roda por cliente e separa o que é inconsistência real do que é só documento incompleto. Ela mostra o total analisado e quantos ficaram bloqueantes.",
    detalhe:
      "Bloqueia de verdade: emitente e destinatário com o mesmo CNPJ, chave de acesso fora do padrão de 44 dígitos num XML completo, e CNPJ do cliente ausente quando o documento traz as duas pontas. Não bloqueia: resumo sem valor ou sem destinatário, e evento sem valor — esses são o estado normal deles.",
  },
  {
    n: 5,
    titulo: "Bloqueante trava o Autopilot",
    corpo:
      "Enquanto houver achado bloqueante no cliente, o fechamento não avança do estágio de auditoria. É proposital: melhor parar do que apurar em cima de documento inconsistente.",
    detalhe:
      "Resolva o achado (ou corrija no ProContador e recapture) e rode a auditoria de novo. O status do documento é recalculado do zero a cada execução.",
  },
];

export function XmlProcessGuide({ dono }: { dono: "saas" | "local" }) {
  const [aberto, setAberto] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-bg-elevated">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span>
          <span className="font-medium">Como funciona a captura de XML</span>
          <span className="block text-xs text-text-muted mt-0.5">
            Da consulta à SEFAZ até o documento pronto para escriturar
          </span>
        </span>
        <span className="text-xs text-text-muted">
          {aberto ? "ocultar" : "ver"}
        </span>
      </button>

      {aberto && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {dono === "local" && (
            <p className="rounded-md border border-border bg-bg-soft px-3 py-2 text-xs">
              <span className="font-medium">Atenção:</span> este ambiente está
              com <code>CAPTURE_OWNER=local</code>, ou seja, falando direto com a
              SEFAZ. Não use assim com o mesmo CNPJ cadastrado também no
              ProContador — os dois vão se bloquear por consumo indevido.
            </p>
          )}

          <ol className="space-y-4">
            {PASSOS.map((p) => (
              <li key={p.n} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]">
                  {p.n}
                </span>
                <div className="space-y-1">
                  <div className="text-sm font-medium">{p.titulo}</div>
                  <p className="text-xs text-text-muted">{p.corpo}</p>
                  {p.detalhe && (
                    <p className="text-xs text-text-muted opacity-80">
                      {p.detalhe}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <p className="border-t border-border pt-3 text-xs text-text-muted">
            Em caso de rejeição da SEFAZ, o código aparece na mensagem. Os mais
            comuns: <span className="font-medium">137</span> nenhum documento
            novo (não é erro), <span className="font-medium">138</span>{" "}
            documentos localizados,{" "}
            <span className="font-medium">656</span> consumo indevido, que exige
            esperar uma hora antes de consultar de novo.
          </p>
        </div>
      )}
    </section>
  );
}
