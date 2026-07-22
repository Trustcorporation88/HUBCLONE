"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function SignContractButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/contracts/${contractId}/sign`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => ref.current?.click()}
        className="rounded-md bg-accent text-bg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        {loading ? "Enviando…" : "Enviar PDF assinado"}
      </button>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
