"use client";

import { useState } from "react";

/**
 * Emissão de convite. O código aparece UMA vez, aqui, logo depois de criar:
 * o banco guarda só o hash. Link perdido significa emitir outro, e isso é
 * proposital — link de convite é credencial.
 */
export function InviteManager({
  podeConvidarEscritorio,
}: {
  podeConvidarEscritorio: boolean;
}) {
  const [kind, setKind] = useState<"JOIN_FIRM" | "NEW_FIRM">(
    podeConvidarEscritorio ? "NEW_FIRM" : "JOIN_FIRM",
  );
  const [role, setRole] = useState("STAFF");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function emitir() {
    setErro(null);
    setLink(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          role: kind === "NEW_FIRM" ? "OWNER" : role,
          email: email.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        caminho?: string;
        error?: string;
      };
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível emitir.");
      } else if (json.caminho) {
        setLink(`${window.location.origin}${json.caminho}`);
      }
    } catch {
      setErro("Falha de conexão.");
    }
    setEnviando(false);
  }

  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-text-muted">Tipo</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="w-full rounded-md border border-border bg-bg-soft px-3 py-2 text-sm"
          >
            <option value="JOIN_FIRM">Usuário no meu escritório</option>
            {podeConvidarEscritorio && (
              <option value="NEW_FIRM">Escritório novo (independente)</option>
            )}
          </select>
        </label>

        {kind === "JOIN_FIRM" && (
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Papel</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-border bg-bg-soft px-3 py-2 text-sm"
            >
              <option value="STAFF">STAFF</option>
              <option value="MANAGER">MANAGER</option>
              <option value="OWNER">OWNER</option>
            </select>
          </label>
        )}

        <label className="space-y-1">
          <span className="text-xs text-text-muted">
            E-mail (trava o convite)
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="opcional"
            className="w-full rounded-md border border-border bg-bg-soft px-3 py-2 text-sm"
          />
        </label>
      </div>

      {kind === "NEW_FIRM" && (
        <p className="rounded-md border border-border bg-bg-soft px-3 py-2 text-xs text-text-muted">
          Cria um escritório independente: clientes, certificados e integrações
          próprios. Você não enxerga os dados dele, nem ele os seus.
        </p>
      )}

      <button
        type="button"
        onClick={emitir}
        disabled={enviando}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-60"
      >
        {enviando ? "Gerando…" : "Gerar convite"}
      </button>

      {erro && <p className="text-xs text-red-400">{erro}</p>}

      {link && (
        <div className="space-y-2 rounded-md border border-border bg-bg-soft p-3">
          <p className="text-xs text-text-muted">
            Envie este link. Ele vale 72 horas, funciona uma vez só e não pode
            ser recuperado depois que você sair desta tela.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
              className="rounded-md border border-border px-3 py-2 text-xs"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
