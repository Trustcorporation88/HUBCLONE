"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SendGuideButtons({
  obligationId,
  hasEmail,
  hasWhatsapp,
  whatsappPhone,
  disabled,
}: {
  obligationId: string;
  hasEmail: boolean;
  hasWhatsapp: boolean;
  whatsappPhone?: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);

  async function sendEmail() {
    setLoading("EMAIL");
    setError(null);
    try {
      const res = await fetch(`/api/obligations/${obligationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["EMAIL"] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no e-mail");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(null);
    }
  }

  async function prepareWhatsApp() {
    setLoading("WA");
    setError(null);
    setWaUrl(null);
    try {
      // 1) gera arquivo + registro manual
      const res = await fetch(`/api/obligations/${obligationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["WHATSAPP_MANUAL"] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao preparar WhatsApp");

      // 2) download automático do arquivo para o usuário anexar
      const fileRes = await fetch(`/api/obligations/${obligationId}/file`);
      if (!fileRes.ok) throw new Error("Não foi possível baixar a guia");
      const blob = await fileRes.blob();
      const cd = fileRes.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="(.+)"/);
      const name = match?.[1] ?? `guia-${obligationId}.txt`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);

      const link =
        data.results?.[0]?.whatsappUrl ??
        (whatsappPhone
          ? `https://wa.me/${whatsappPhone.replace(/\D/g, "")}`
          : null);
      setWaUrl(link);
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
          onClick={sendEmail}
          className="rounded border border-border px-2 py-1 text-[11px] hover:border-accent disabled:opacity-40"
          title="Envio automático por e-mail"
        >
          {loading === "EMAIL" ? "…" : "E-mail"}
        </button>
        <button
          type="button"
          disabled={disabled || loading !== null}
          onClick={prepareWhatsApp}
          className="rounded border border-border px-2 py-1 text-[11px] hover:border-accent disabled:opacity-40"
          title="Baixa o arquivo; você anexa e envia no WhatsApp"
        >
          {loading === "WA" ? "…" : "WhatsApp (manual)"}
        </button>
        <a
          href={`/api/obligations/${obligationId}/file`}
          className="rounded bg-accent text-bg px-2 py-1 text-[11px] font-medium"
        >
          Baixar guia
        </a>
      </div>
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-accent hover:underline"
        >
          Abrir conversa no WhatsApp →
        </a>
      )}
      {!hasWhatsapp && (
        <span className="text-[10px] text-text-muted">
          Sem nº: baixe e envie pelo seu WhatsApp
        </span>
      )}
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
      {loading ? "…" : "Marcar lido"}
    </button>
  );
}
