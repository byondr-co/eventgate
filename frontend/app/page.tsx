"use client";

import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/lib/api";
import { HealthcheckCard } from "@/components/healthcheck-card";

export default function HomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
  });

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-3xl font-semibold text-center">Eventgate</h1>
        {isLoading && <HealthcheckCard loading />}
        {isError && <HealthcheckCard status="ok" database="error" version="unknown" />}
        {data && (
          <HealthcheckCard
            status={data.status}
            database={data.database}
            version={data.version}
          />
        )}
      </div>
    </main>
  );
}
