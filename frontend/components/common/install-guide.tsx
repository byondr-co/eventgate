import { InstallPWA } from "@/lib/illustrations";
import { cn } from "@/lib/utils";

type InstallGuideProps = { className?: string };

function InstallGuide({ className }: InstallGuideProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex items-center gap-3">
        <InstallPWA className="size-8 text-foreground" />
        <p className="text-sm font-semibold">Add this page to your home screen</p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            iOS · Safari
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap Share, then &ldquo;Add to Home Screen&rdquo;.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Android · Chrome
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the ⋮ menu, then &ldquo;Add to Home screen&rdquo;.
          </p>
        </div>
      </div>
    </div>
  );
}

export { InstallGuide };
