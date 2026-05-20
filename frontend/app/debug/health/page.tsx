"use client";

import { useQuery } from "@tanstack/react-query";

import { HealthcheckCard } from "@/components/healthcheck-card";
import { getHealth } from "@/lib/api";

export default function DebugHealthPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {isLoading && <HealthcheckCard loading />}
        {isError && <HealthcheckCard status="ok" database="error" version="unknown" />}
        {data && (
          <HealthcheckCard status={data.status} database={data.database} version={data.version} />
        )}
      </div>
    </main>
  );
}
