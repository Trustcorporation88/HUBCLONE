"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ProContadorSyncButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/procontador/sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no import");
      setMsg(
        `ProContador: ${data.created} novos · ${data.updated} atualizados · ${data.skipped} ignorados`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-1">
      <button
        type="button"
        disabled={!enabled || loading}
        onClick={run}
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-soft disabled:opacity-50"
      >
        {loading ? "Importando ProContador…" : "Importar empresas ProContador"}
      </button>
      <p className="text-[11px] text-text-muted">
        Fonte:{" "}
        <a
          href="https://www.procontador.com.br"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          www.procontador.com.br
        </a>{" "}
        → clientes do OS (por CNPJ)
      </p>
      {msg && <p className="text-xs text-text-muted">{msg}</p>}
    </div>
  );
}

export function OmieSyncButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/omie/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no import");
      setMsg(
        `Importado: ${data.created} novos · ${data.updated} atualizados · ${data.skipped} ignorados`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-1">
      <button
        type="button"
        disabled={!enabled || loading}
        onClick={run}
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-soft disabled:opacity-50"
      >
        {loading ? "Importando Omie…" : "Importar clientes Omie"}
      </button>
      {msg && <p className="text-xs text-text-muted">{msg}</p>}
    </div>
  );
}

export function DominioCsvImport() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/integrations/dominio/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no import");
      setMsg(
        `CSV Domínio: ${data.created} novos · ${data.updated} atualizados · ${data.skipped} ignorados`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-text-muted leading-relaxed">
        Domínio Contábil não tem API pública tipo Omie. Para o escritório
        testar agora: exporte clientes no Domínio (CSV/Excel salva como CSV) com
        colunas <code className="text-accent">cnpj;razao_social;nome_fantasia;email;regime</code>{" "}
        e importe abaixo. API parceiro (baseUrl + token) fica para quando a Trust
        tiver credencial Thomson/Onvio.
      </p>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => ref.current?.click()}
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-soft disabled:opacity-50"
      >
        {loading ? "Importando…" : "Importar CSV Domínio"}
      </button>
      {msg && <p className="text-xs text-text-muted">{msg}</p>}
    </div>
  );
}
