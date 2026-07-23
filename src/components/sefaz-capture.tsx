"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ClientOpt = { id: string; label: string };

export function CertUploadForm({ clients }: { clients: ClientOpt[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        body: data,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha no upload");
      setMsg(`Certificado OK · CNPJ ${json.cnpj} · ambiente ${json.environment}`);
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-sm">
      <div className="grid md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-text-muted text-xs">Arquivo .pfx / .p12</span>
          <input
            name="pfx"
            type="file"
            accept=".pfx,.p12"
            required
            className="mt-1 block w-full text-xs"
          />
        </label>
        <label className="block">
          <span className="text-text-muted text-xs">Senha do A1</span>
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-text-muted text-xs">Cliente</span>
          <select
            name="clientId"
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
            defaultValue=""
          >
            <option value="">Detectar CNPJ do cert</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-text-muted text-xs">Ambiente SEFAZ</span>
          <select
            name="environment"
            defaultValue="1"
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
          >
            <option value="1">Produção</option>
            <option value="2">Homologação</option>
          </select>
        </label>
      </div>
      <input type="hidden" name="label" value="A1 DistDFe" />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-accent text-bg px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Validando…" : "Cadastrar certificado A1"}
      </button>
      {msg && <p className="text-xs text-success">{msg}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

export function CaptureButton({
  clientId,
  clientLabel,
}: {
  clientId: string;
  clientLabel: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kinds, setKinds] = useState({ NFE: true, CTE: true, NFSE: false });

  async function capture() {
    setLoading(true);
    setInfo(null);
    setError(null);
    const selected = (Object.keys(kinds) as Array<keyof typeof kinds>).filter(
      (k) => kinds[k],
    );
    if (!selected.length) {
      setError("Selecione ao menos NF-e, CT-e ou NFS-e");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/xml/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          kinds: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha na captura");
      const run = data.run;
      const warn = data.warning ? ` · aviso: ${data.warning}` : "";
      setInfo(
        `${clientLabel}: LIVE · ${run.docsSaved}/${run.docsFound} salvos · ${run.cStat ?? "—"}${warn}`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2 text-[10px] text-text-muted">
        {(["NFE", "CTE", "NFSE"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={kinds[k]}
              onChange={(e) =>
                setKinds((prev) => ({ ...prev, [k]: e.target.checked }))
              }
            />
            {k === "NFE" ? "NF-e" : k === "CTE" ? "CT-e" : "NFS-e"}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={() => capture()}
        className="rounded-md bg-accent text-bg px-2 py-1 text-[11px] font-medium disabled:opacity-50"
      >
        {loading ? "…" : "Capturar SEFAZ"}
      </button>
      {info && (
        <span className="text-[10px] text-success max-w-xs text-right">{info}</span>
      )}
      {error && (
        <span className="text-[10px] text-danger max-w-xs text-right">{error}</span>
      )}
    </div>
  );
}
