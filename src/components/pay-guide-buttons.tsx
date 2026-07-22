"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PaymentDto = {
  id: string;
  method: string;
  status: string;
  amountCents: number;
  pixCopyPaste?: string | null;
  boletoDigitable?: string | null;
  boletoBarcode?: string | null;
  proofPath?: string | null;
};

export function PayGuideButtons({
  obligationId,
  disabled,
  payments,
}: {
  obligationId: string;
  disabled?: boolean;
  payments: PaymentDto[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentDto | null>(null);

  const pending = created ?? payments.find((p) => p.status === "PENDING");
  const paid = payments.find((p) => p.status === "PAID");

  async function create(method: "PIX" | "BOLETO") {
    setLoading(method);
    setError(null);
    try {
      const res = await fetch(`/api/obligations/${obligationId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar pagamento");
      setCreated(data.payment);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(null);
    }
  }

  async function confirm(paymentId: string) {
    setLoading("CONFIRM");
    setError(null);
    try {
      const res = await fetch(`/api/payments/${paymentId}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao confirmar");
      setCreated(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  if (paid) {
    return (
      <div className="text-right space-y-1">
        <div className="text-[11px] text-success font-medium">Pago · {paid.method}</div>
        <a
          href={`/api/payments/${paid.id}/proof`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-accent hover:underline"
        >
          Ver comprovante
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 max-w-sm">
      {!pending && (
        <div className="flex gap-1">
          <button
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => create("PIX")}
            className="rounded-md bg-accent text-bg px-2 py-1 text-[11px] font-medium disabled:opacity-40"
          >
            {loading === "PIX" ? "…" : "Pagar PIX"}
          </button>
          <button
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => create("BOLETO")}
            className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-40"
          >
            {loading === "BOLETO" ? "…" : "Boleto"}
          </button>
        </div>
      )}

      {pending && (
        <div className="w-full rounded border border-border bg-bg p-2 space-y-2 text-left">
          <div className="text-[11px] font-medium">
            {pending.method} · aguardando pagamento
          </div>
          {pending.method === "PIX" && pending.pixCopyPaste && (
            <div className="space-y-1">
              <p className="text-[10px] text-text-muted break-all leading-snug">
                {pending.pixCopyPaste}
              </p>
              <button
                type="button"
                className="text-[10px] text-accent"
                onClick={() => copy(pending.pixCopyPaste!)}
              >
                Copiar PIX
              </button>
            </div>
          )}
          {pending.method === "BOLETO" && pending.boletoDigitable && (
            <div className="space-y-1">
              <p className="text-[10px] text-text-muted break-all">
                {pending.boletoDigitable}
              </p>
              <button
                type="button"
                className="text-[10px] text-accent"
                onClick={() => copy(pending.boletoDigitable!)}
              >
                Copiar linha digitável
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => confirm(pending.id)}
            className="rounded-md bg-success/20 text-success px-2 py-1 text-[11px] font-medium disabled:opacity-50"
          >
            {loading === "CONFIRM" ? "Confirmando…" : "Confirmar pagamento"}
          </button>
        </div>
      )}

      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}
