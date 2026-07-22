"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "O que cada menu do sistema faz?",
  "Importei 17 clientes e o painel está zerado — é normal?",
  "Como cadastro a primeira guia/obrigação?",
  "Como configuro certificado A1 e captura XML?",
];

export function OfficeChat({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou o assistente do ProContador OS. Pergunte sobre qualquer serviço do escritório — Painel, Guias, XML, Autopilot, Integrações…",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => m.role === "user" || m.role === "assistant"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no chat");
      setMessages((m) => [...m, { role: "assistant", content: String(data.reply) }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <div
      className={
        compact
          ? "flex h-[28rem] flex-col rounded-lg border border-border bg-bg-elevated"
          : "flex h-[min(70vh,36rem)] flex-col rounded-lg border border-border bg-bg-elevated"
      }
    >
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium">Assistente do escritório</p>
        <p className="text-xs text-text-muted">
          Usa a mesma API key OpenAI (Integrações ou Railway)
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={
              m.role === "user"
                ? "ml-8 rounded-md bg-accent/15 px-3 py-2 text-text"
                : "mr-4 rounded-md bg-bg-soft px-3 py-2 text-text-muted whitespace-pre-wrap"
            }
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <p className="text-xs text-text-muted">Pensando…</p>
        )}
        <div ref={bottomRef} />
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => void send(s)}
              className="rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:bg-bg-soft disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="flex gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tire uma dúvida do contador…"
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
      {error && (
        <p className="border-t border-border px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
