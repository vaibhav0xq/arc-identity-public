import type { Activity } from "@/lib/types";

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  return (
    <div className="arc-surface rounded-2xl p-7">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-white">Recent activity</h2>
        <span className="rounded-md bg-white/[0.06] px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-slate-400">
          Local verified events
        </span>
      </div>
      <div className="space-y-3.5">
        {activities.slice(0, 6).map((activity) => (
          <div
            key={activity.id}
            className="arc-card-hover flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4"
          >
            <div>
              <p className="font-bold text-white">{activity.description}</p>
              <p className="mt-1.5 text-[0.8125rem] text-slate-500">
                {new Date(activity.createdAt).toLocaleString()}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-md px-2.5 py-1 text-sm font-extrabold tabular-nums ${
                activity.scoreImpact >= 0
                  ? "bg-emerald-300/[0.12] text-emerald-200"
                  : "bg-rose-400/[0.12] text-rose-200"
              }`}
            >
              {activity.scoreImpact >= 0 ? "+" : ""}
              {activity.scoreImpact}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
