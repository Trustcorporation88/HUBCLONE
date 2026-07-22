"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SendGuideButtons({
  obligationId,
  hasEmail,
  hasWhatsapp,
  disabled,
}: {
  obligationId: string;
  hasEmail: boolean;
  hasWhatsapp: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(channels: ("EMAIL" | "WHATSAPP")[]) {
    setLoading(channels.join("+"));
    setError(null);
    try {
      const res = await fetch(`/api/obligations/${obligationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no envio");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        <button
          type="button"
          disabled={disabled || !hasEmail || loading !== null}
          onClick={() => send(["EMAIL"])}
          className="rounded border border-border px-2 py-1 text-[11px] hover:border-accent disabled:opacity-40"
        >
          {loading === "EMAIL" ? "…" : "E-mail"}
        </button>
        <button
          type="button"
          disabled={disabled || !hasWhatsapp || loading !== null}
          onClick={() => send(["WHATSAPP"])}
          className="rounded border border-border px-2 py-1 text-[11px] hover:border-accent disabled:opacity-40"
        >
          {loading === "WHATSAPP" ? "…" : "WhatsApp"}
        </button>
        <button
          type="button"
          disabled={
            disabled || (!hasEmail && !hasWhatsapp) || loading !== null
          }
          onClick={() =>
            send(
              [
                ...(hasEmail ? (["EMAIL"] as const) : []),
                ...(hasWhatsapp ? (["WHATSAPP"] as const) : []),
              ],
            )
          }
          className="rounded bg-accent text-bg px-2 py-1 text-[11px] font-medium disabled:opacity-40"
        >
          {loading?.includes("+") || loading === "EMAIL+WHATSAPP"
            ? "…"
            : "Ambos"}
        </button>
      </div>
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}

export function MarkViewedButton({ deliveryId }: { deliveryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function mark() {
    setLoading(true);
    try {
      await fetch(`/api/deliveries/${deliveryId}/view`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={mark}
      disabled={loading}
      className="text-[10px] text-accent hover:underline disabled:opacity-50"
    >
      {loading ? "…" : "Simular leitura"}
    </button>
  );
}
