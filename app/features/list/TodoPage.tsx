import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useStoredValue } from "~/client-storage";
import { GuestContext } from "~/guest-context";
import { getProfileLabel } from "~/profile-label";
import { WEB_VERSION } from "~/constants/changelog";
import {
  DEFAULT_TASK_SORT_MODE,
  describeDeleteTarget,
  getLocalTimeZone,
  resolveTaskSortMode,
  taskSortStorageKey,
  type ListActivityEntry,
  type PendingDeleteRequest,
} from "../../../shared";
import { MAX_LIST_NAME_LENGTH } from "~/write-limits";

import type { loader as listLoader } from "./loader.server";
import { useGuestLists } from "./hooks/useGuestLists";
import { useProfileSettings } from "./hooks/useProfileSettings";
import { useListDialogs } from "./hooks/useListDialogs";
import { useVisibleTodos, type Filter } from "./hooks/useVisibleTodos";
import { useBrowserReminders } from "./hooks/useBrowserReminders";
import { useWebMcpTools } from "./hooks/useWebMcpTools";

import { CalendarView } from "~/components/calendar-view";
import { CompletedSectionToggle, Confetti, EmptyState, ProgressRing, Toast } from "./components/ui-bits";
import { TodoItem } from "./components/TodoItem";
import { Sidebar } from "./components/Sidebar";
import { CreateTaskForm } from "./components/CreateTaskForm";
import { TaskToolbar } from "./components/TaskToolbar";
import { ProfileModal } from "./components/ProfileModal";
import { ActivityLogModal } from "./components/ActivityLogModal";
import { WhatsNewModal } from "./components/WhatsNewModal";
import { ListDialogs } from "./components/ListDialogs";

export default function TodoPage() {
  const {
    userId,
    email,
    isLoggedIn,
    settings,
    lists: serverLists,
    activeListId,
    stats,
    pendingDeleteRequests = [],
    listActivity: loaderListActivity = [],
  } = useLoaderData<typeof listLoader>();

  const profileLabel = getProfileLabel({
    email,
    displayName: settings?.displayName,
    displayNameSet: settings?.displayNameSet,
  });

  const navigate = useNavigate();
  const createFetcher = useFetcher();
  const clearFetcher = useFetcher<{
    success?: boolean;
    pendingApproval?: boolean;
    message?: string;
    error?: string;
  }>();
  const listFetcher = useFetcher<{
    success?: boolean;
    pendingApproval?: boolean;
    message?: string;
    error?: string;
  }>();
  const deleteRequestFetcher = useFetcher();
  const activityFetcher = useFetcher<{
    success?: boolean;
    entries?: ListActivityEntry[];
    listName?: string;
    error?: string;
  }>();
  const settingsFetcher = useFetcher();
  const suggestionFetcher = useFetcher();
  const timeZoneFetcher = useFetcher();
  const initTimeZoneSent = useRef(false);

  // Fill in the home time zone (used by repeating reminders) once from this
  // browser when the account has none. Never changed silently afterwards;
  // the user changes it under Profile → Home time zone.
  useEffect(() => {
    if (!isLoggedIn || settings?.timeZone || initTimeZoneSent.current) return;
    const zone = getLocalTimeZone();
    if (!zone) return;
    initTimeZoneSent.current = true;
    timeZoneFetcher.submit({ intent: "initTimeZone", timeZone: zone }, { method: "post" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, settings?.timeZone]);

  const {
    hydrated,
    guestLists,
    lists,
    activeListMeta,
    effectiveActiveListId,
    isSharedServerList,
    todos,
    canSetReminders,
    guestContextValue,
    handleGuestAction,
  } = useGuestLists({
    isLoggedIn,
    userId,
    serverLists,
    activeListId,
    listFetcher,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const listNameInputRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<Filter>("all");
  // The list's Completed section starts collapsed, isn't remembered, and
  // collapses again when another list is opened.
  const [completedOpenListId, setCompletedOpenListId] = useState<string | null>(null);
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "none">("none");
  const [newDurationMinutes, setNewDurationMinutes] = useState<number | null>(null);
  const [showDurationPicker, setShowDurationPicker] = useState<boolean>(false);
  const [reminderMode, setReminderMode] = useState<"none" | "duration" | "specific">("none");
  const [reminderDuration, setReminderDuration] = useState<number>(5);
  const [reminderDateTime, setReminderDateTime] = useState<string>("");
  const [showReminderPanel, setShowReminderPanel] = useState<boolean>(false);

  const [toast, setToast] = useState({ message: "", visible: false });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // The changelog opens by itself once per new version (after hydration),
  // or when the user opens it from the menu.
  const [lastSeenChangelog, setLastSeenChangelog] = useStoredValue("last_seen_changelog_version");
  const [isChangelogOpenedManually, setIsChangelogOpenedManually] = useState(false);
  const isChangelogOpen = isChangelogOpenedManually || (hydrated && lastSeenChangelog !== WEB_VERSION);

  const handleCloseChangelog = () => {
    setLastSeenChangelog(WEB_VERSION);
    setIsChangelogOpenedManually(false);
  };

  const [savedViewMode, setSavedViewMode] = useStoredValue("synx_view_mode");
  const viewMode: "list" | "calendar" = savedViewMode === "calendar" ? "calendar" : "list";

  const changeViewMode = (mode: "list" | "calendar") => {
    setSavedViewMode(mode);
  };

  // UX additions: theme, search, sort, share popup
  const [savedTheme, setSavedTheme] = useStoredValue("synx_theme");
  const theme = savedTheme || "midnight";
  const [searchQuery, setSearchQuery] = useState("");
  // Each list remembers its "Sort by" choice in this browser (Reminder Time
  // until one is picked). The server render and hydration use the default.
  const [savedSortBy, setSavedSortBy] = useStoredValue(
    taskSortStorageKey(effectiveActiveListId || "")
  );
  const sortBy = resolveTaskSortMode(DEFAULT_TASK_SORT_MODE, savedSortBy);
  const [showSharePopover, setShowSharePopover] = useState(false);
  const sharePopoverRef = useRef<HTMLDivElement>(null);

  const [showActivityModal, setShowActivityModal] = useState(false);
  const seededActivity = (loaderListActivity as ListActivityEntry[]) || [];
  const [activityEntries, setActivityEntries] = useState<ListActivityEntry[]>(seededActivity);
  const [activityHasMore, setActivityHasMore] = useState(seededActivity.length >= 50);
  const [syncedActivitySeed, setSyncedActivitySeed] = useState<ListActivityEntry[]>(seededActivity);
  if (syncedActivitySeed !== seededActivity) {
    setSyncedActivitySeed(seededActivity);
    setActivityEntries(seededActivity);
    setActivityHasMore(seededActivity.length >= 50);
  }
  const [syncedActivityData, setSyncedActivityData] = useState(activityFetcher.data);
  if (activityFetcher.state === "idle" && activityFetcher.data !== syncedActivityData) {
    setSyncedActivityData(activityFetcher.data);
    const data = activityFetcher.data;
    if (data?.success && Array.isArray(data.entries)) {
      const seen = new Set(activityEntries.map((e) => e.id));
      setActivityEntries([...activityEntries, ...data.entries.filter((e) => !seen.has(e.id))]);
      setActivityHasMore(data.entries.length >= 50);
    }
  }

  // Apply the saved theme to the page once it is read from localStorage.
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [hydrated, theme]);

  const changeTheme = (newTheme: string) => {
    setSavedTheme(newTheme);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sharePopoverRef.current && !sharePopoverRef.current.contains(e.target as Node)) {
        setShowSharePopover(false);
      }
    }
    if (showSharePopover) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSharePopover]);

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2200);
  }, []);

  const {
    emailEnabled,
    setEmailEnabled,
    smsEnabled,
    setSmsEnabled,
    phoneInput,
    setPhoneInput,
    phoneCarrier,
    setPhoneCarrier,
    discordEnabled,
    setDiscordEnabled,
    discordInput,
    setDiscordInput,
    displayNameInput,
    setDisplayNameInput,
    homeTimeZoneInput,
    setHomeTimeZoneInput,
    pendingNameSuggestion,
    acceptNameSuggestion,
    dismissNameSuggestion,
    timeZoneOptions,
    browserTimeZone,
    showUnsavedPrompt,
    setShowUnsavedPrompt,
    resetSettings,
    handleSaveSettings,
    requestCloseProfile,
  } = useProfileSettings({
    settings,
    hydrated,
    isProfileOpen,
    setIsProfileOpen,
    settingsFetcher,
    suggestionFetcher,
    timeZoneFetcher,
    showToast,
  });

  const {
    listToDelete,
    setListToDelete,
    listToRename,
    setListToRename,
    renameInput,
    setRenameInput,
    isCreateListOpen,
    setIsCreateListOpen,
    newListInput,
    setNewListInput,
    newListCategory,
    setNewListCategory,
    customCategoryInput,
    setCustomCategoryInput,
    listToEditCategory,
    setListToEditCategory,
    editCategorySelection,
    setEditCategorySelection,
    editCustomCategoryInput,
    setEditCustomCategoryInput,
    renameListInputRef,
    createListInputRef,
    editCategoryInputRef,
    isAnyModalOpen,
  } = useListDialogs({
    showUnsavedPrompt,
    setShowUnsavedPrompt,
    showActivityModal,
    setShowActivityModal,
    isChangelogOpen,
    handleCloseChangelog,
    isProfileOpen,
    requestCloseProfile,
  });

  // Inline List Title Edit State (Main Panel Header)
  const activeListName = activeListMeta?.name || "My Tasks";
  const activeListShareMode: "private" | "public_read" | "public_edit" =
    activeListMeta?.share_mode === "public_read" || activeListMeta?.share_mode === "public_edit"
      ? activeListMeta.share_mode
      : "private";
  const isOwner = activeListMeta ? activeListMeta.owner_id === userId : false;
  // Name others see on this user's shared lists (saved value, not unsaved edits).
  const ownDisplayName = settings?.displayNameSet ? settings?.displayName : null;
  const canEdit =
    isOwner ||
    (isLoggedIn && activeListShareMode === "public_edit") ||
    (!isLoggedIn && !isSharedServerList) ||
    !activeListMeta;

  const ownedPendingDeleteRequests = useMemo(
    () =>
      (pendingDeleteRequests as PendingDeleteRequest[]).filter((r) => {
        const list = lists.find((l) => l.id === r.listId);
        return list ? list.owner_id === userId : true;
      }),
    [pendingDeleteRequests, lists, userId]
  );
  const activeListPendingDeletes = useMemo(
    () =>
      (pendingDeleteRequests as PendingDeleteRequest[]).filter(
        (r) => r.listId === activeListId
      ),
    [pendingDeleteRequests, activeListId]
  );
  const pendingClearCompleted = activeListPendingDeletes.some(
    (r) => r.targetType === "clear_completed"
  );
  const pendingListDelete = activeListPendingDeletes.some((r) => r.targetType === "list");

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(activeListName);
  const titleEditInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && isOwner) {
      titleEditInputRef.current?.focus();
    }
  }, [isEditingTitle, isOwner]);

  // Follow the list name when it changes (switching lists, renames).
  const [syncedListName, setSyncedListName] = useState(activeListName);
  if (syncedListName !== activeListName) {
    setSyncedListName(activeListName);
    setTitleInput(activeListName);
  }

  // Sync to-do create fetcher
  const isCreating = createFetcher.state !== "idle";
  const prevIsCreating = useRef(isCreating);
  useEffect(() => {
    if (prevIsCreating.current && !isCreating) {
      if (inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
      // Reset reminder & duration states
      setReminderMode("none");
      setReminderDuration(5);
      setReminderDateTime("");
      setShowReminderPanel(false);
      setNewDurationMinutes(null);
      setShowDurationPicker(false);
    }
    prevIsCreating.current = isCreating;
  }, [isCreating]);

  // Sync new list fetcher
  const isCreatingList =
    listFetcher.state !== "idle" && listFetcher.formData?.get("intent") === "createList";
  const prevIsCreatingList = useRef(isCreatingList);
  useEffect(() => {
    if (prevIsCreatingList.current && !isCreatingList) {
      if (listNameInputRef.current) listNameInputRef.current.value = "";
    }
    prevIsCreatingList.current = isCreatingList;
  }, [isCreatingList]);

  // Reminders and WebMCP hooks
  useBrowserReminders({ lists, userId });
  useWebMcpTools({ activeListId, todos, createFetcher });

  // Visible todos and counts
  const {
    optimisticTodos,
    visibleParents,
    activeParents,
    completedParents,
    subtasksMap,
    totalCount,
    completedCount,
    activeCount,
    clearCompletedNeedsApproval,
  } = useVisibleTodos({ todos, filter, searchQuery, sortBy });

  const completedSectionOpen = completedOpenListId === effectiveActiveListId;

  // Surface server-side rejections of a new task (too long, list full, rate limited).
  const createData = createFetcher.data as { error?: string } | undefined;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (createFetcher.state === "idle" && createData?.error) showToast(createData.error);
  }, [createFetcher.state, createData, showToast]);

  // Collaborator delete / clear-completed / list-delete → pending approval toast.
  useEffect(() => {
    if (clearFetcher.state !== "idle" || !clearFetcher.data) return;
    if (clearFetcher.data.pendingApproval && clearFetcher.data.message) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      showToast(clearFetcher.data.message);
    } else if (clearFetcher.data.error) {
      showToast(clearFetcher.data.error);
    }
  }, [clearFetcher.state, clearFetcher.data, showToast]);

  useEffect(() => {
    if (listFetcher.state !== "idle" || !listFetcher.data) return;
    if (listFetcher.data.pendingApproval && listFetcher.data.message) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      showToast(listFetcher.data.message);
    } else if (listFetcher.data.error) {
      showToast(listFetcher.data.error);
    }
  }, [listFetcher.state, listFetcher.data, showToast]);

  const handleExportData = () => {
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lists, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `synx_backup_${userId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("✓ Exported all list data!");
  };

  const handleTitleSubmit = () => {
    if (titleInput.trim() && titleInput.trim() !== activeListName) {
      if (!isLoggedIn && !isSharedServerList) {
        // Guest lists live in localStorage, same as the sidebar rename.
        handleGuestAction("renameList", {
          listId: effectiveActiveListId,
          newName: titleInput.trim(),
        });
        setIsEditingTitle(false);
        return;
      }
      listFetcher.submit(
        { intent: "renameList", listId: activeListId || "", newName: titleInput.trim() },
        { method: "post" }
      );
    }
    setIsEditingTitle(false);
  };

  // Confetti trigger
  const [showConfetti, setShowConfetti] = useState(false);
  const prevCompletedCount = useRef(completedCount);
  const prevTotalTodos = useRef(totalCount);

  useEffect(() => {
    if (
      totalCount > 0 &&
      completedCount === totalCount &&
      (prevCompletedCount.current < prevTotalTodos.current ||
        prevCompletedCount.current !== completedCount)
    ) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
    prevCompletedCount.current = completedCount;
    prevTotalTodos.current = totalCount;
  }, [completedCount, totalCount]);

  return (
    <GuestContext.Provider value={guestContextValue}>
      <div className="min-h-screen md:h-screen bg-themeBg text-slate-100 flex flex-col md:grid md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] relative overflow-x-hidden overflow-y-auto md:overflow-hidden font-sans w-full max-w-[100vw]">
        {/* Confetti Celebration */}
        {showConfetti && <Confetti />}

        {/* ── Ambient Gradient Blobs ─────────────────────────── */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-themeAccentFrom/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 -right-24 w-80 h-80 bg-themeAccentTo/10 rounded-full blur-[100px]" />
        </div>

        {/* ── Mobile Header Bar ─────────────────────────────── */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-themeSidebar border-b border-themeBorder relative z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-themeAccentFrom to-themeAccentTo flex items-center justify-center shadow-lg">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="font-extrabold text-lg text-slate-200 tracking-tight font-display">sYnX</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`synx://${activeListId || ""}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-themeAccentFrom/20 border border-themeAccentFrom/40 text-themeAccentFrom hover:bg-themeAccentFrom/30 text-xs font-semibold transition-all shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Open in App
            </a>
            <button
              onClick={() => setIsSidebarOpen((o) => !o)}
              className="text-slate-300 p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                {isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </header>

        {/* ── Sidebar Component (Desktop and Mobile drawer) ──── */}
        <Sidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          isCreatingList={isCreatingList}
          lists={lists}
          activeListId={activeListId}
          userId={userId}
          pendingDeleteRequests={pendingDeleteRequests as PendingDeleteRequest[]}
          setListToDelete={setListToDelete}
          setListToRename={setListToRename}
          setRenameInput={setRenameInput}
          settingsFetcher={settingsFetcher}
          setIsCreateListOpen={setIsCreateListOpen}
          isLoggedIn={isLoggedIn}
          settings={settings}
          profileLabel={profileLabel}
          setIsProfileOpen={setIsProfileOpen}
        />

        {/* ── Main Area ─────────────────────────────────────── */}
        <main className="relative z-10 flex flex-col py-6 px-4 sm:px-5 md:px-6 lg:px-8 max-w-2xl mx-auto w-full min-w-0 md:max-w-none md:h-screen md:overflow-x-hidden md:overflow-y-auto">
          {isLoggedIn && ownedPendingDeleteRequests.length > 0 && (
            <section
              className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3"
              aria-label="Pending delete requests"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-200">
                  Delete requests
                </h2>
                <span className="text-[10px] font-semibold text-amber-300/80">
                  {ownedPendingDeleteRequests.length} pending
                </span>
              </div>
              <ul className="space-y-2">
                {ownedPendingDeleteRequests.map((req) => {
                  const summary = describeDeleteTarget(req.targetType, req.targetLabel);
                  const onThisList = req.listId === activeListId;
                  return (
                    <li
                      key={req.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl bg-black/20 border border-white/[0.04] px-3 py-2"
                    >
                      <div className="min-w-0 text-xs text-slate-200">
                        <span className="font-semibold">Delete {summary}</span>
                        {!onThisList && (
                          <span className="text-slate-400"> on &ldquo;{req.listName}&rdquo;</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={deleteRequestFetcher.state !== "idle"}
                          onClick={() =>
                            deleteRequestFetcher.submit(
                              { intent: "approveDeleteRequest", requestId: req.id },
                              { method: "post" }
                            )
                          }
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-themeAccentFrom/90 hover:bg-themeAccentTo text-white transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={deleteRequestFetcher.state !== "idle"}
                          onClick={() =>
                            deleteRequestFetcher.submit(
                              { intent: "declineDeleteRequest", requestId: req.id },
                              { method: "post" }
                            )
                          }
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 transition-colors disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!isOwner && pendingListDelete && (
            <div className="mb-4 text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
              A request to delete this list is waiting for the owner&apos;s approval.
            </div>
          )}

          {/* Header (Active list title + Progress) */}
          <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.04] pb-6 min-w-0">
            <div className="min-w-0 flex-1 overflow-hidden">
              {isEditingTitle && isOwner ? (
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    ref={titleEditInputRef}
                    type="text"
                    value={titleInput}
                    maxLength={MAX_LIST_NAME_LENGTH}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={handleTitleSubmit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSubmit();
                      if (e.key === "Escape") {
                        setTitleInput(activeListName);
                        setIsEditingTitle(false);
                      }
                    }}
                    className="text-2xl sm:text-3xl font-extrabold bg-transparent border-b-2 border-themeAccentFrom text-slate-100 focus:outline-none py-0.5 w-full font-display"
                  />
                  <button
                    onClick={handleTitleSubmit}
                    className="bg-themeAccentFrom hover:bg-themeAccentTo text-white rounded-lg p-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 group">
                  <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-white via-slate-100 to-slate-350 bg-clip-text text-transparent font-display truncate pr-2">
                    {isOwner ? (
                      <button
                        onClick={() => {
                          setTitleInput(activeListName);
                          setIsEditingTitle(true);
                        }}
                        className="text-left hover:text-themeAccentText transition-colors flex items-center gap-2 cursor-pointer bg-transparent border-none p-0 font-inherit"
                        title="Click to rename"
                      >
                        <span>{activeListName}</span>
                        {/* Always shown on touch screens; revealed on hover or keyboard focus elsewhere. */}
                        <svg className="w-4 h-4 text-slate-500 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    ) : (
                      <span>{activeListName}</span>
                    )}
                  </h1>

                  {activeListMeta?.category && (() => {
                    const cat = activeListMeta.category;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (isOwner && cat) {
                            setListToEditCategory({
                              id: activeListMeta.id,
                              name: activeListMeta.name,
                              category: cat,
                            });
                            const isPreset = [
                              "Checklist",
                              "Study",
                              "Shopping",
                              "Movies",
                              "Work",
                              "Personal",
                              "Travel",
                              "Fitness",
                            ].includes(cat);
                            setEditCategorySelection(isPreset ? cat : "Custom");
                            setEditCustomCategoryInput(isPreset ? "" : cat);
                          }
                        }}
                        className={`text-xs px-2.5 py-0.5 rounded-full border border-themeAccentRing/30 bg-themeAccentBg text-themeAccentText font-semibold flex items-center gap-1 transition-all ${
                          isOwner ? "hover:border-themeAccentRing cursor-pointer" : "cursor-default"
                        }`}
                        title={isOwner ? "Edit Category Tag" : undefined}
                      >
                        <span>🏷️ {cat}</span>
                      </button>
                    );
                  })()}

                  {!activeListMeta?.category && isOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setListToEditCategory({
                          id: activeListMeta.id,
                          name: activeListMeta.name,
                        });
                        setEditCategorySelection("Checklist");
                        setEditCustomCategoryInput("");
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 transition-all cursor-pointer opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      + Add Tag
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500 mt-1">
                {!isOwner && activeListMeta?.owner_display_name
                  ? `Shared by ${activeListMeta.owner_display_name}`
                  : activeCount === 0 && totalCount > 0
                    ? "🎉 All tasks completed!"
                    : `${activeCount} task${activeCount !== 1 ? "s" : ""} remaining`}
                {!isOwner && activeListMeta?.owner_display_name
                  ? ` · ${activeCount} task${activeCount !== 1 ? "s" : ""} remaining`
                  : null}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 self-start sm:self-auto">
              <ProgressRing completed={completedCount} total={totalCount} />
            </div>
          </header>

          {/* Create Task Form / View Only Banner */}
          <CreateTaskForm
            canEdit={canEdit}
            isLoggedIn={isLoggedIn}
            isSharedServerList={isSharedServerList}
            activeListMeta={activeListMeta}
            createFetcher={createFetcher}
            inputRef={inputRef}
            isCreating={isCreating}
            newPriority={newPriority}
            setNewPriority={setNewPriority}
            newDurationMinutes={newDurationMinutes}
            setNewDurationMinutes={setNewDurationMinutes}
            showDurationPicker={showDurationPicker}
            setShowDurationPicker={setShowDurationPicker}
            reminderMode={reminderMode}
            setReminderMode={setReminderMode}
            reminderDuration={reminderDuration}
            setReminderDuration={setReminderDuration}
            reminderDateTime={reminderDateTime}
            setReminderDateTime={setReminderDateTime}
            showReminderPanel={showReminderPanel}
            setShowReminderPanel={setShowReminderPanel}
            canSetReminders={canSetReminders}
            handleGuestAction={handleGuestAction}
            showToast={showToast}
          />

          {/* Toolbar (Filters, Search, Sort & Actions) */}
          <TaskToolbar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortBy={sortBy}
            setSavedSortBy={setSavedSortBy}
            filter={filter}
            setFilter={setFilter}
            totalCount={totalCount}
            activeCount={activeCount}
            completedCount={completedCount}
            viewMode={viewMode}
            changeViewMode={changeViewMode}
            pendingClearCompleted={pendingClearCompleted}
            clearFetcher={clearFetcher}
            isLoggedIn={isLoggedIn}
            isSharedServerList={isSharedServerList}
            handleGuestAction={handleGuestAction}
            isOwner={isOwner}
            clearCompletedNeedsApproval={clearCompletedNeedsApproval}
            activeListShareMode={activeListShareMode}
            loaderListActivity={loaderListActivity}
            setActivityEntries={setActivityEntries}
            setActivityHasMore={setActivityHasMore}
            setShowActivityModal={setShowActivityModal}
            showSharePopover={showSharePopover}
            setShowSharePopover={setShowSharePopover}
            sharePopoverRef={sharePopoverRef}
            listFetcher={listFetcher}
            activeListId={activeListId}
            ownDisplayName={ownDisplayName}
            showToast={showToast}
          />

          {/* Todo List Area */}
          <div className="flex-1 min-h-0 mb-6 flex flex-col">
            {viewMode === "calendar" ? (
              <CalendarView todos={optimisticTodos} activeListId={activeListId || ""} canEdit={canEdit} onNotify={showToast} />
            ) : visibleParents.length === 0 && totalCount === 0 ? (
              <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col justify-center">
                <EmptyState />
              </div>
            ) : visibleParents.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No {filter === "active" ? "active" : "completed"} tasks in this list.
              </div>
            ) : (
              <ul className="space-y-2 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                {activeParents.map((todo) => (
                  <TodoItem 
                    key={todo.id} 
                    todo={todo} 
                    subtasks={subtasksMap[todo.id] || []}
                    canEdit={canEdit}
                    onNotify={showToast}
                    searchQuery={searchQuery}
                  />
                ))}
                {completedParents.length > 0 && (
                  <li className="list-none flex">
                    <CompletedSectionToggle
                      count={completedParents.length}
                      expanded={completedSectionOpen}
                      onToggle={() =>
                        setCompletedOpenListId(completedSectionOpen ? null : effectiveActiveListId ?? null)
                      }
                      itemLabel="tasks"
                    />
                  </li>
                )}
                {completedSectionOpen &&
                  completedParents.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      subtasks={subtasksMap[todo.id] || []}
                      canEdit={canEdit}
                      onNotify={showToast}
                      searchQuery={searchQuery}
                    />
                  ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <footer className="mt-auto pt-6 border-t border-white/[0.04] text-center max-w-lg mx-auto w-full flex flex-col items-center gap-1">
            <p className="text-slate-500 text-[11px] font-medium flex items-center gap-1.5 justify-center">
              <span>sYnX • Sync your tasks. Execute your day.</span>
              <span className="text-slate-600">•</span>
              <a
                href="https://christran.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-themeAccentText transition-colors duration-200"
              >
                christran.io
              </a>
            </p>
            <div className="flex gap-2 text-[10px] text-slate-600">
              <a
                href="https://christran.io/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-themeAccentText transition-colors duration-200"
              >
                Privacy Policy
              </a>
              <span>•</span>
              <a
                href="https://christran.io/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-themeAccentText transition-colors duration-200"
              >
                Terms of Service
              </a>
            </div>
          </footer>
        </main>

        {/* ── Profile and Statistics Modal ─────────────────── */}
        <ProfileModal
          isProfileOpen={isProfileOpen}
          requestCloseProfile={requestCloseProfile}
          profileLabel={profileLabel}
          settings={settings}
          displayNameInput={displayNameInput}
          setDisplayNameInput={setDisplayNameInput}
          email={email}
          userId={userId}
          showToast={showToast}
          pendingNameSuggestion={pendingNameSuggestion}
          acceptNameSuggestion={acceptNameSuggestion}
          dismissNameSuggestion={dismissNameSuggestion}
          isLoggedIn={isLoggedIn}
          homeTimeZoneInput={homeTimeZoneInput}
          setHomeTimeZoneInput={setHomeTimeZoneInput}
          timeZoneOptions={timeZoneOptions}
          browserTimeZone={browserTimeZone || ""}
          stats={stats}
          theme={theme}
          changeTheme={changeTheme}
          emailEnabled={emailEnabled}
          setEmailEnabled={setEmailEnabled}
          smsEnabled={smsEnabled}
          setSmsEnabled={setSmsEnabled}
          phoneInput={phoneInput}
          setPhoneInput={setPhoneInput}
          phoneCarrier={phoneCarrier}
          setPhoneCarrier={setPhoneCarrier}
          discordEnabled={discordEnabled}
          setDiscordEnabled={setDiscordEnabled}
          discordInput={discordInput}
          setDiscordInput={setDiscordInput}
          handleSaveSettings={handleSaveSettings}
          setIsProfileOpen={setIsProfileOpen}
          setIsChangelogOpenedManually={setIsChangelogOpenedManually}
          handleExportData={handleExportData}
        />

        {/* ── Owner Activity Log Modal ──────────────────────── */}
        <ActivityLogModal
          showActivityModal={showActivityModal}
          setShowActivityModal={setShowActivityModal}
          activityEntries={activityEntries}
          activityHasMore={activityHasMore}
          activityFetcher={activityFetcher}
          activeListId={activeListId}
        />

        {/* ── What's New / Version Log Modal ─────────────────── */}
        <WhatsNewModal
          isChangelogOpen={isChangelogOpen}
          handleCloseChangelog={handleCloseChangelog}
        />

        {/* ── Modals / Dialogs ───────────────────────────────── */}
        <ListDialogs
          showUnsavedPrompt={showUnsavedPrompt}
          setShowUnsavedPrompt={setShowUnsavedPrompt}
          resetSettings={resetSettings}
          setIsProfileOpen={setIsProfileOpen}
          handleSaveSettings={handleSaveSettings}
          listToRename={listToRename}
          setListToRename={setListToRename}
          renameInput={renameInput}
          setRenameInput={setRenameInput}
          renameListInputRef={renameListInputRef}
          isLoggedIn={isLoggedIn}
          isSharedServerList={isSharedServerList}
          handleGuestAction={handleGuestAction}
          listFetcher={listFetcher}
          listToDelete={listToDelete}
          setListToDelete={setListToDelete}
          lists={lists}
          userId={userId}
          guestLists={guestLists}
          navigate={navigate}
          isCreateListOpen={isCreateListOpen}
          setIsCreateListOpen={setIsCreateListOpen}
          createListInputRef={createListInputRef}
          newListInput={newListInput}
          setNewListInput={setNewListInput}
          newListCategory={newListCategory}
          setNewListCategory={setNewListCategory}
          customCategoryInput={customCategoryInput}
          setCustomCategoryInput={setCustomCategoryInput}
          listToEditCategory={listToEditCategory}
          setListToEditCategory={setListToEditCategory}
          editCategorySelection={editCategorySelection}
          setEditCategorySelection={setEditCategorySelection}
          editCustomCategoryInput={editCustomCategoryInput}
          setEditCustomCategoryInput={setEditCustomCategoryInput}
          editCategoryInputRef={editCategoryInputRef}
        />

        {/* One-time display name offer outside Profile (Profile shows it inline). */}
        {isLoggedIn && pendingNameSuggestion && !isAnyModalOpen && (
          <div
            role="status"
            className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-40 rounded-xl border border-themeAccentRing/30 bg-slate-900/95 backdrop-blur p-3.5 shadow-2xl text-left"
          >
            <p className="text-xs text-slate-200 leading-relaxed">
              Use <span className="font-semibold">&ldquo;{pendingNameSuggestion}&rdquo;</span> as your display name? It will be visible to people you share lists with.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => acceptNameSuggestion(pendingNameSuggestion)}
                className="text-[11px] font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-md px-2.5 py-1 transition-colors cursor-pointer"
              >
                Use this name
              </button>
              <button
                type="button"
                onClick={dismissNameSuggestion}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 rounded-md px-2.5 py-1 border border-white/10 transition-colors cursor-pointer bg-transparent"
              >
                No thanks
              </button>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        <Toast message={toast.message} visible={toast.visible} />
      </div>
    </GuestContext.Provider>
  );
}
