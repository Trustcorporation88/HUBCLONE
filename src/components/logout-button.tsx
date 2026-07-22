"use client";

import { usePathname, useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    const dest = pathname.startsWith("/portal") ? "/portal/login" : "/login";
    router.replace(dest);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="text-xs text-text-muted hover:text-text"
    >
      Sair
    </button>
  );
}
