import type { Comment } from "@/types/projects";

export function ActivityEntry({ activity }: { activity: Pick<Comment, "content" | "createdAt"> }) {
  return (
    <li className="flex gap-3 rounded-lg bg-slate-50 px-2 py-2">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold text-indigo-700">Actividad</span>
          <time dateTime={activity.createdAt} className="text-[10px] text-slate-400">
            {new Date(activity.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
          </time>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-600">{activity.content}</p>
      </div>
    </li>
  );
}
