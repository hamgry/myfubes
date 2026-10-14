import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-neutral-500">
          Cargando Fube…
        </div>
      }
    >
      <AppShell />
    </Suspense>
  );
}
