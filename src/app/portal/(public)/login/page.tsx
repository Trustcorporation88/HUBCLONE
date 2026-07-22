import { Suspense } from "react";
import PortalLoginForm from "./login-form";

export default function PortalLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-text-muted">
          Carregando…
        </div>
      }
    >
      <PortalLoginForm />
    </Suspense>
  );
}
