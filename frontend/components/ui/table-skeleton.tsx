import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div data-slot="table-skeleton" className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export { TableSkeleton };
