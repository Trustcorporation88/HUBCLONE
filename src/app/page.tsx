import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const firmCount = await prisma.firm.count().catch(() => -1);
  const needsSetup = firmCount === 0;
  const officeHref = needsSetup ? "/setup" : "/login";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 md:px-10 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/procontador-office-logo.png"
            alt="ProContador Office"
            width={44}
            height={44}
            className="rounded-sm object-contain"
            priority
          />
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Trust Corporation
            </div>
            <div
              className="text-xl md:text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ProContador Office
            </div>
          </div>
        </div>
        <Link
          href={officeHref}
          className="rounded-md bg-accent text-accent-ink px-4 py-2 text-sm font-semibold hover:opacity-90"
        >
          {needsSetup ? "Criar escritório" : "Entrar"}
        </Link>
      </header>

      <section className="relative flex-1 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 55% 70% at 85% 45%, rgba(31,107,94,0.28), transparent 60%), radial-gradient(ellipse 40% 50% at 15% 20%, rgba(201,163,90,0.12), transparent 55%), linear-gradient(165deg, #0c0e0c 0%, #121612 50%, #0a0c0a 100%)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-6 md:px-10 py-12 md:py-16 lg:py-20 grid lg:grid-cols-2 gap-10 lg:gap-6 items-center min-h-[calc(100vh-5rem)]">
          <div className="max-w-xl">
            <p className="text-accent text-sm font-medium tracking-wide">
              Do zero · best-of-breed · Brasil + mundo
            </p>
            <h1
              className="mt-4 text-4xl md:text-5xl lg:text-[3.25rem] font-semibold leading-[1.1] tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              O único sistema que fecha a obrigação inteira.
            </h1>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
              Captura → audita → apura → guia → paga → prova → fecha tarefa.
              HubStrom junta pedaços. Nós juntamos o pipeline que Jettax, Qive,
              Dootax, Karbon e TaxDome nunca uniram.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={officeHref}
                className="rounded-md bg-accent text-accent-ink px-5 py-2.5 text-sm font-semibold"
              >
                {needsSetup ? "Criar escritório" : "Escritório"}
              </Link>
              <Link
                href="/portal/login"
                className="rounded-md border border-border px-5 py-2.5 text-sm text-text-muted hover:text-text hover:border-accent/40"
              >
                Portal do cliente
              </Link>
              <Link
                href="/app/knowledge"
                className="rounded-md border border-border px-5 py-2.5 text-sm text-text-muted hover:text-text hover:border-accent/40"
              >
                Base de conhecimento
              </Link>
            </div>
            {needsSetup && (
              <p className="mt-6 text-sm text-text-muted">
                Primeiro acesso: crie o escritório em{" "}
                <Link href="/setup" className="text-accent underline">
                  /setup
                </Link>
                .
              </p>
            )}
          </div>

          <div className="relative flex items-center justify-center lg:justify-end">
            <div
              className="absolute w-[min(90vw,28rem)] h-[min(90vw,28rem)] rounded-full blur-3xl opacity-40 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(31,107,94,0.45) 0%, transparent 70%)",
              }}
            />
            <Image
              src="/brand/procontador-office-logo.png"
              alt="Logotipo ProContador Office"
              width={560}
              height={560}
              priority
              className="relative w-[min(92vw,32rem)] h-auto drop-shadow-[0_25px_60px_rgba(0,0,0,0.55)] select-none"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
