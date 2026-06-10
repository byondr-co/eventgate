import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div data-slot="table-skeleton" role="status" className={cn(className)}>
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export { TableSkeleton };
