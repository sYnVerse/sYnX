import type { Dispatch, RefObject, SetStateAction } from "react";
import type { FetcherWithComponents } from "react-router";
import type { GuestActionPayload } from "~/guest-context";
import {
  DEFAULT_TASK_SORT_MODE,
  TASK_SORT_OPTIONS,
  getShareModeLabel,
  getSharedNameNotice,
  isMakingListPublic,
  resolveTaskSortMode,
  type ListActivityEntry,
  type TaskSortMode,
} from "../../../../shared";
import type { Filter } from "../hooks/useVisibleTodos";

const TASK_SORT_EMOJI: Record<TaskSortMode, string> = {
  created: "🕒",
  priority: "🔴",
  reminder: "⏰",
  alphabetical: "🔤",
};

const filterButtons: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Done" },
];

interface TaskToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: TaskSortMode;
  setSavedSortBy: (mode: TaskSortMode) => void;
  filter: Filter;
  setFilter: (filter: Filter) => void;
  totalCount: number;
  activeCount: number;
  completedCount: number;
  viewMode: "list" | "calendar";
  changeViewMode: (mode: "list" | "calendar") => void;
  pendingClearCompleted: boolean;
  clearFetcher: FetcherWithComponents<unknown>;
  isLoggedIn: boolean;
  isSharedServerList: boolean;
  handleGuestAction: (intent: string, payload?: GuestActionPayload) => void;
  isOwner: boolean;
  clearCompletedNeedsApproval: boolean;
  activeListShareMode: "private" | "public_read" | "public_edit";
  loaderListActivity?: unknown;
  setActivityEntries?: (entries: ListActivityEntry[]) => void;
  setActivityHasMore?: (hasMore: boolean) => void;
  setShowActivityModal: (show: boolean) => void;
  showSharePopover: boolean;
  setShowSharePopover: Dispatch<SetStateAction<boolean>>;
  sharePopoverRef: RefObject<HTMLDivElement | null>;
  listFetcher: FetcherWithComponents<unknown>;
  activeListId?: string;
  ownDisplayName: string | null | undefined;
  showToast: (msg: string) => void;
}

export function TaskToolbar({
  searchQuery,
  setSearchQuery,
  sortBy,
  setSavedSortBy,
  filter,
  setFilter,
  totalCount,
  activeCount,
  completedCount,
  viewMode,
  changeViewMode,
  pendingClearCompleted,
  clearFetcher,
  isLoggedIn,
  isSharedServerList,
  handleGuestAction,
  isOwner,
  clearCompletedNeedsApproval,
  activeListShareMode,
  loaderListActivity,
  setActivityEntries,
  setActivityHasMore,
  setShowActivityModal,
  showSharePopover,
  setShowSharePopover,
  sharePopoverRef,
  listFetcher,
  activeListId,
  ownDisplayName,
  showToast,
}: TaskToolbarProps) {
  return (
    <div className="flex flex-col gap-3.5 mb-5 border-b border-white/[0.04] pb-5 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        {/* Search Box */}
        <div className="relative flex-1 max-w-sm min-w-0">
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-w-0 text-xs rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-200 placeholder-slate-500 pl-8 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
          />
          <svg className="w-4 h-4 text-slate-500 absolute left-2.5 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-slate-500 hover:text-slate-300 absolute right-2.5 top-2.5 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSavedSortBy(resolveTaskSortMode(DEFAULT_TASK_SORT_MODE, e.target.value))}
            className="rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-300 text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 cursor-pointer appearance-none bg-slate-900 pr-8 relative max-w-[11rem]"
            style={{
              backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.5rem center',
              backgroundSize: '1.25rem',
              backgroundRepeat: 'no-repeat',
            }}
          >
            {TASK_SORT_OPTIONS.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                className="bg-slate-900 text-slate-100"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
              >
                {`${TASK_SORT_EMOJI[opt.value]} ${opt.label}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
        <div className="flex flex-wrap gap-3 items-center min-w-0">
          {/* Filter buttons */}
          <div className="flex gap-1 bg-white/[0.02] border border-white/[0.04] rounded-xl p-1 self-start">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                  ${filter === f.key
                    ? "bg-themeAccentBg text-themeAccentText shadow-sm"
                    : "text-slate-500 hover:text-slate-350"
                  }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-50 font-bold">
                  {f.key === "all" ? totalCount : f.key === "active" ? activeCount : completedCount}
                </span>
              </button>
            ))}
          </div>

          {/* View switcher */}
          <div className="flex gap-1 bg-white/[0.02] border border-white/[0.04] rounded-xl p-1 self-start">
            <button
              type="button"
              onClick={() => changeViewMode("list")}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                ${viewMode === "list"
                  ? "bg-themeAccentBg text-themeAccentText shadow-sm"
                  : "text-slate-500 hover:text-slate-350"
                }`}
            >
              📝 List
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("calendar")}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                ${viewMode === "calendar"
                  ? "bg-themeAccentBg text-themeAccentText shadow-sm"
                  : "text-slate-500 hover:text-slate-350"
                }`}
            >
              📅 Calendar
            </button>
          </div>
        </div>

        {/* Action buttons (Clear completed, Share Popover) */}
        <div className="flex gap-3 items-center self-end sm:self-auto shrink-0">
          {completedCount > 0 && !pendingClearCompleted && (
            <clearFetcher.Form
              method="post"
              onSubmit={() => {
                if (!isLoggedIn && !isSharedServerList) {
                  handleGuestAction("clearCompleted", {});
                }
              }}
            >
              <input type="hidden" name="intent" value="clearCompleted" />
              <button
                type="submit"
                className="text-xs text-slate-500 hover:text-rose-400 font-semibold transition-colors duration-200 cursor-pointer bg-transparent"
              >
                {isOwner || !isSharedServerList || !clearCompletedNeedsApproval ? "Clear completed" : "Request clear completed"}
              </button>
            </clearFetcher.Form>
          )}
          {pendingClearCompleted && (
            <span className="text-xs text-amber-300/90 font-semibold" title="Waiting for the list owner">
              Clear requested
            </span>
          )}

          {isOwner && isLoggedIn && activeListShareMode !== "private" && (
            <button
              type="button"
              onClick={() => {
                if (setActivityEntries && Array.isArray(loaderListActivity)) {
                  setActivityEntries(loaderListActivity as ListActivityEntry[]);
                  setActivityHasMore?.(loaderListActivity.length >= 50);
                }
                setShowActivityModal(true);
              }}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-themeAccentText font-semibold transition-colors duration-200 cursor-pointer bg-transparent"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Activity
            </button>
          )}

          {/* Enhanced Share Menu */}
          <div ref={sharePopoverRef} className="relative">
            <button
              type="button"
              onClick={() => setShowSharePopover((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-themeAccentText font-semibold transition-colors duration-200 cursor-pointer bg-transparent"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742l5.053-2.526m0 3.568l-5.053-2.526A3 3 0 1111 8a3 3 0 011.684 2.742l5.053 2.526A3 3 0 1112 21a3 3 0 01-3.316-2.258l-5.053-2.526A3 3 0 118.684 10.742z" />
              </svg>
              Share List ({activeListShareMode === "private" ? "Private" : activeListShareMode === "public_read" ? "View-Only" : "Collaborative"})
            </button>

            {showSharePopover && (
              <div className="absolute right-0 top-full mt-2.5 z-[60] bg-slate-900 border border-white/10 rounded-xl p-4 shadow-2xl min-w-[260px] flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Share Settings</span>
                  <p className="text-[10px] text-slate-400">Configure access permissions for this list.</p>
                </div>

                {isOwner ? (
                  <div className="flex flex-col gap-2">
                    {(["private", "public_read", "public_edit"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`w-full text-left text-xs font-semibold p-2.5 rounded-lg border transition-all duration-200 flex items-center justify-between
                          ${activeListShareMode === mode
                            ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                            : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                          }`}
                        onClick={() => {
                          listFetcher.submit({
                            intent: "updateShareMode",
                            listId: activeListId || "",
                            shareMode: mode,
                          }, { method: "post" });
                          showToast(
                            isMakingListPublic(activeListShareMode, mode)
                              ? `✓ Shared as ${getShareModeLabel(mode)}. ${getSharedNameNotice(mode, ownDisplayName)}`
                              : `✓ Share permission updated to ${getShareModeLabel(mode)}!`
                          );
                        }}
                      >
                        <span>
                          {mode === "private" ? "🔒 Private" : mode === "public_read" ? "👁 View-Only" : "🤝 Collaborative"}
                        </span>
                        {activeListShareMode === mode && <span className="text-xs">✓</span>}
                      </button>
                    ))}
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {getSharedNameNotice(activeListShareMode, ownDisplayName)}
                      {activeListShareMode === "public_edit" && " Anyone with the link can view; editors must sign in."}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 text-[11px] text-slate-500">
                    You do not own this list. Permissions are managed by the owner.
                  </div>
                )}

                <hr className="border-white/[0.06]" />

                <button
                  type="button"
                  disabled={activeListShareMode === "private" && !isOwner}
                  onClick={() => {
                    const url = activeListId ? `${window.location.origin}/list/${activeListId}` : window.location.href;
                    navigator.clipboard.writeText(url).then(() => {
                      showToast("✓ Link copied to clipboard!");
                    });
                    setShowSharePopover(false);
                  }}
                  className="w-full text-center text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl py-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Copy Sharing Link
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
