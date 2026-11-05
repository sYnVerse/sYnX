import type { FetcherWithComponents } from "react-router";
import { describeListActivityAction, type ListActivityEntry } from "../../../../shared";
import { formatActivityWhen } from "../format";

interface ActivityLogModalProps {
  showActivityModal: boolean;
  setShowActivityModal: (show: boolean) => void;
  activityEntries: ListActivityEntry[];
  activityHasMore: boolean;
  activityFetcher: FetcherWithComponents<unknown>;
  activeListId?: string;
}

export function ActivityLogModal({
  showActivityModal,
  setShowActivityModal,
  activityEntries,
  activityHasMore,
  activityFetcher,
  activeListId,
}: ActivityLogModalProps) {
  if (!showActivityModal) return null;

  return (
    <div
      role="presentation"
      onClick={() => setShowActivityModal(false)}
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-center overflow-y-auto p-4 transition-all duration-300 cursor-pointer"
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        className="my-auto bg-slate-900 border border-white/10 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative overflow-hidden cursor-default text-slate-100"
      >
        <div className="flex items-center justify-between mb-4 border-b border-white/[0.08] pb-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-100 font-display">Activity</h3>
            <p className="text-[11px] text-slate-400">
              Who changed this shared list, and from which IP. Only you can see this.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowActivityModal(false)}
            className="text-slate-400 hover:text-slate-200 transition-colors bg-transparent cursor-pointer"
            aria-label="Close activity"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3 custom-scrollbar mb-4">
          {activityEntries.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No activity yet on this shared list.
            </p>
          ) : (
            activityEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200">
                      {describeListActivityAction(entry.action)}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {entry.actorLabel}
                      {entry.actorType !== "owner" ? (
                        <span className="text-slate-500"> · {entry.actorType}</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {formatActivityWhen(entry.createdAt)}
                  </span>
                </div>
                {entry.summary ? (
                  <p className="text-[11px] text-slate-400 leading-snug">{entry.summary}</p>
                ) : null}
                {entry.clientIp ? (
                  <p className="text-[10px] text-slate-500 font-mono">IP {entry.clientIp}</p>
                ) : null}
              </div>
            ))
          )}
        </div>

        {activityHasMore && activityEntries.length > 0 && (
          <button
            type="button"
            disabled={activityFetcher.state !== "idle"}
            onClick={() => {
              const oldest = activityEntries[activityEntries.length - 1]?.createdAt;
              if (oldest == null) return;
              activityFetcher.submit(
                {
                  intent: "listActivity",
                  listId: activeListId || "",
                  before: String(oldest),
                },
                { method: "post" }
              );
            }}
            className="w-full text-center text-xs font-semibold text-slate-200 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl py-2.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mb-2"
          >
            {activityFetcher.state !== "idle" ? "Loading…" : "Load more"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowActivityModal(false)}
          className="w-full text-center text-xs font-bold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl py-3 transition-all cursor-pointer shadow-md active:scale-[0.98]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
