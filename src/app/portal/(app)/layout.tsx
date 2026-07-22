import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClientSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/portal", label: "Início" },
  { href: "/portal/guias", label: "Guias" },
  { href: "/portal/xml", label: "Notas" },
  { href: "/portal/assinaturas", label: "Assinaturas" },
  { href: "/portal/inbox", label: "Inbox" },
  { href: "/portal/saude", label: "Saúde" },
  { href: "/portal/advisory", label: "Advisory" },
];

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await requireClientSession();
  } catch {
    redirect("/portal/login");
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-bg-elevated">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-text-muted">
              App do cliente
            </div>
            <div className="text-xl font-semibold tracking-tight mt-0.5">
              {session.brandName}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-text-muted">{session.name}</div>
            <LogoutButton />
          </div>
        </div>
        <nav className="max-w-3xl mx-auto px-5 pb-3 flex gap-1 flex-wrap">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-bg-soft hover:text-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8">{children}</main>
    </div>
  );
}
