import { ArcShell } from "@/components/ArcShell";

/**
 * Route-level loading skeleton shared by loading.tsx files. Renders inside
 * the console workspace frame so it matches the app page that replaces it.
 */
export function RouteSkeleton({ panels = 2 }: { panels?: number }) {
  return (
    <ArcShell>
      <section className="min-w-0 space-y-7 py-8">
        <div>
          <span className="skeleton h-3 w-44" />
          <span className="skeleton mt-4 h-12 w-72 max-w-full sm:h-16 sm:w-96" />
          <span className="skeleton mt-4 h-4 w-64 max-w-full" />
        </div>
        {Array.from({ length: panels }).map((_, panel) => (
          <section key={panel} className="r4-panel">
            <div className="r4-panel-head">
              <span className="skeleton h-3.5 w-44" />
              <span className="skeleton h-3 w-24" />
            </div>
            <div className="r4-panel-body">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center justify-between gap-6 border-b border-linec py-4 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <span className="skeleton h-4 w-48 max-w-full" />
                    <span className="skeleton mt-2 h-3 w-32 max-w-full" />
                  </div>
                  <span className="skeleton h-3.5 w-16" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </section>
    </ArcShell>
  );
}
