"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { OfficeChat } from "@/components/office-chat";

export function OfficeChatFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-[min(100vw-2rem,24rem)] shadow-2xl">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-2 -right-2 z-10 rounded-full border border-border bg-bg-elevated p-1.5 text-text-muted hover:text-text"
              aria-label="Fechar assistente"
            >
              <X size={14} />
            </button>
            <OfficeChat compact />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg hover:opacity-90"
        aria-label="Abrir assistente"
      >
        <MessageCircle size={22} strokeWidth={1.75} />
      </button>
    </>
  );
}
