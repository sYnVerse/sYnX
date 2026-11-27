import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Await, useFetcher, useLoaderData, useNavigate } from "react-router";
import { useStoredValue } from "~/client-storage";
import { GuestContext } from "~/guest-context";
import { getProfileLabel } from "~/profile-label";
import { WEB_VERSION } from "~/constants/changelog";
import {
  ARCHIVE_PROMPT_DISMISSED_STORAGE_KEY,
  DEFAULT_TASK_SORT_MODE,
  QUICK_PICK_DURATION_MINUTES,
  applyOptimisticReorder,
  canArchiveList,
  canMoveTaskInDirection,
  clearArchivePromptDismissed,
  describeDeleteTarget,
  formatRescheduledToast,
  getCategoryTagEmoji,
  isListCompleted,
  isPresetCategory,
  getLocalTimeZone,
  markArchivePromptDismissed,
  parseDismissedArchivePrompts,
  resolveTaskSortMode,
  serializeDismissedArchivePrompts,
  shouldSuggestArchivingList,
  taskSortStorageKey,
  type ListActivityEntry,
  type PendingDeleteRequest,
} from "@synx/shared";
import { MAX_LIST_NAME_LENGTH } from "@synx/shared/write-limits";
import type { CompletionSummary, Todo } from "@synx/backend/services/to-do-manager";

import type { loader as listLoader } from "./loader.server";
import { useFetcherToast } from "./hooks/useFetcherToast";
import { useGuestLists } from "./hooks/useGuestLists";
import { useProfileSettings } from "./hooks/useProfileSettings";
import { useListDialogs } from "./hooks/useListDialogs";
import { useVisibleTodos, type Filter } from "./hooks/useVisibleTodos";
import { useBrowserReminders } from "./hooks/useBrowserReminders";
import { useWebMcpTools } from "./hooks/useWebMcpTools";
import { useSubtaskCompletionPrompt } from "./hooks/useSubtaskCompletionPrompt";

import { CalendarView } from "~/components/calendar-view";
import {
  CompletedSectionToggle,
  Confetti,
  EmptyState,
  ProgressRing,
  Toast,
  type WebToastAction,
} from "./components/ui-bits";
import { TodoItem } from "./components/TodoItem";
import { Sidebar } from "./components/Sidebar";
import { CreateTaskForm } from "./components/CreateTaskForm";
import { TaskToolbar } from "./components/TaskToolbar";
import { ProfileModal } from "./components/ProfileModal";
import { ActivityLogModal } from "./components/ActivityLogModal";
import { WhatsNewModal } from "./components/WhatsNewModal";
import { ListDialogs } from "./components/ListDialogs";
import { SubtaskCompletionModal } from "./components/SubtaskCompletionModal";

export default function TodoPage({
  isIndexRedirecting = false,
}: {
  isIndexRedirecting?: boolean;
} = {}) {
  const {
    userId,
    email,
    isLoggedIn,
    settings,
    lists: serverLists,
    activeListId,
    stats,
    completionStatsByTodoId = {},
    pendingDeleteRequests = [],
    ownedPendingDeleteRequests,
    providerProfile,
    listActivity: loaderListActivity,
  } = useLoaderData<typeof listLoader>();

  const profileLabel = getProfileLabel({
    email,
    displayName: settings?.displayName,
    displayNameSet: settings?.displayNameSet,
  });

  const navigate = useNavigate();
  const createFetcher = useFetcher<{ error?: string }>();
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
  const completionActionFetcher = useFetcher<{
    success?: boolean;
    todo?: Todo;
    error?: string;
  }>();
  const reorderFetcher = useFetcher<{
    success?: boolean;
    todos?: Todo[];
    error?: string;
  }>();
  const initTimeZoneSent = useRef(false);

  // Fill in the home time zone (used by repeating reminders) once from this
  // browser when the account has none. Never changed silently afterwards;
  // the user changes it under Profile → Home time zone.
  const submitTimeZoneFetcher = timeZoneFetcher.submit;
  useEffect(() => {
    if (!isLoggedIn || isIndexRedirecting || settings?.timeZone || initTimeZoneSent.current) return;
    const zone = getLocalTimeZone();
    if (!zone) return;
    initTimeZoneSent.current = true;
    submitTimeZoneFetcher({ intent: "initTimeZone", timeZone: zone }, { method: "post" });
  }, [isLoggedIn, isIndexRedirecting, settings?.timeZone, submitTimeZoneFetcher]);

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
    isIndexRedirecting,
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

  const [toast, setToast] = useState<{
    message: string;
    visible: boolean;
    actions?: WebToastAction[];
  }>({ message: "", visible: false });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // The changelog opens by itself once per new version (after hydration),
  // or when the user opens it from the menu.
  const [lastSeenChangelog, setLastSeenChangelog] = useStoredValue("last_seen_changelog_version");
  const [isChangelogOpenedManually, setIsChangelogOpenedManually] = useState(false);
  const isChangelogOpen =
    isChangelogOpenedManually || (hydrated && !isIndexRedirecting && lastSeenChangelog !== WEB_VERSION);

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

  // Apply the saved theme to the page once it is read from localStorage.
  // Skip while routes/_index is transiently redirecting to /$id so tests wait for the settled route.
  useEffect(() => {
    if (!hydrated || isIndexRedirecting) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [hydrated, isIndexRedirecting, theme]);

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

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast((t) => ({ ...t, visible: false }));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      options?: { actions?: WebToastAction[]; durationMs?: number }
    ) => {
      setToast({ message, visible: true, actions: options?.actions });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      const duration =
        options?.durationMs ??
        (message.startsWith("Couldn't save") ? 4000 : 2200);
      toastTimerRef.current = setTimeout(
        () => setToast((t) => ({ ...t, visible: false })),
        duration
      );
    },
    []
  );

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
    smartQuickAddEnabled,
    setSmartQuickAddEnabled,
    archiveSuggestionsEnabled,
    setArchiveSuggestionsEnabled,
  } = useProfileSettings({
    settings,
    providerProfile,
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
      // Only return focus to the main create input if the user hasn't moved
      // focus elsewhere (e.g., into an inline subtask composer while creating).
      const activeEl = document.activeElement;
      const shouldRefocus =
        !activeEl ||
        activeEl === document.body ||
        activeEl === inputRef.current ||
        Boolean(inputRef.current?.form?.contains(activeEl));
      if (shouldRefocus) {
        inputRef.current?.focus();
      }
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

  const submitCompletionAction = completionActionFetcher.submit;
  const handleTaskCompletedFeedback = useCallback(
    ({
      todo,
      rescheduled,
      completion,
    }: {
      todo: Todo;
      rescheduled: boolean;
      completion?: CompletionSummary | null;
    }) => {
      const actions: WebToastAction[] = [];
      const needsQuickPick = Boolean(
        isLoggedIn && completion && completion.durationSeconds === null
      );
      if (needsQuickPick && completion) {
        for (const mins of QUICK_PICK_DURATION_MINUTES) {
          const label = mins === 60 ? "1h" : `${mins}m`;
          actions.push({
            label,
            testId: `toast-duration-${mins}`,
            variant: "primary",
            onClick: () => {
              submitCompletionAction(
                {
                  intent: "setCompletionDuration",
                  completionId: completion.id,
                  durationMinutes: String(mins),
                },
                { method: "post" }
              );
              showToast(`✓ Logged ${label}`);
            },
          });
        }
        actions.push({
          label: "Skip",
          testId: "toast-duration-skip",
          variant: "ghost",
          onClick: () => dismissToast(),
        });
      }
      if (rescheduled && isLoggedIn && completion) {
        actions.push({
          label: "Undo",
          testId: "toast-undo-repeat",
          variant: "ghost",
          onClick: () => {
            submitCompletionAction(
              {
                intent: "undoRepeat",
                id: todo.id,
                completionId: completion.id,
              },
              { method: "post" }
            );
            showToast("↩ Undid completion");
          },
        });
      }

      if (rescheduled && todo.reminderAt) {
        const baseMsg = formatRescheduledToast(todo.reminderAt);
        const message = needsQuickPick
          ? `${baseMsg} · How long did it take?`
          : baseMsg;
        showToast(
          message,
          actions.length > 0 ? { actions, durationMs: 6500 } : undefined
        );
      } else if (needsQuickPick) {
        showToast("How long did it take?", { actions, durationMs: 6500 });
      }
    },
    [isLoggedIn, submitCompletionAction, showToast, dismissToast]
  );

  const {
    optimisticTodos: listTodosWithSubtaskAction,
    promptState: subtaskPromptState,
    isSlowPending: isSubtaskCompletionSlowPending,
    maybePromptForCompletion,
    confirmSubtaskCompletion,
    cancelSubtaskCompletion,
  } = useSubtaskCompletionPrompt({
    todos,
    isLoggedIn,
    handleGuestAction,
    onNotify: showToast,
    onTaskCompleted: handleTaskCompletedFeedback,
  });

  const todosWithOptimisticReorder = useMemo(() => {
    if (
      reorderFetcher.state === "idle" ||
      reorderFetcher.formData?.get("intent") !== "reorderTasks"
    ) {
      return listTodosWithSubtaskAction;
    }
    const rawIds = reorderFetcher.formData.get("orderedIds");
    if (typeof rawIds !== "string") return listTodosWithSubtaskAction;
    try {
      const parsedIds = JSON.parse(rawIds) as unknown;
      if (!Array.isArray(parsedIds)) return listTodosWithSubtaskAction;
      const parentIdRaw = reorderFetcher.formData.get("parentId");
      const targetParentId =
        typeof parentIdRaw === "string" && parentIdRaw.trim() !== ""
          ? parentIdRaw.trim()
          : null;
      return (
        applyOptimisticReorder(
          listTodosWithSubtaskAction,
          parsedIds.filter((x): x is string => typeof x === "string"),
          targetParentId
        ) ?? listTodosWithSubtaskAction
      );
    } catch {
      return listTodosWithSubtaskAction;
    }
  }, [listTodosWithSubtaskAction, reorderFetcher.state, reorderFetcher.formData]);

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
    progress,
    clearCompletedNeedsApproval,
  } = useVisibleTodos({ todos: todosWithOptimisticReorder, filter, searchQuery, sortBy });

  const completedSectionOpen = completedOpenListId === effectiveActiveListId;

  const [timerNow, setTimerNow] = useState(0);
  const hasRunningTimer = optimisticTodos.some(
    (t) => t.startedAt != null && !t.completed
  );
  useEffect(() => {
    if (!hasRunningTimer) return;
    let timerId: number;
    const tick = () => {
      setTimerNow(Date.now());
      timerId = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timerId = window.setTimeout(tick, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [hasRunningTimer]);

  // Surface server-side rejections (too long, list full, rate limited) and pending-approval notices.
  useFetcherToast(createFetcher, showToast);
  useFetcherToast(clearFetcher, showToast, { surfacePendingApproval: true });
  useFetcherToast(listFetcher, showToast, { surfacePendingApproval: true });
  useFetcherToast(completionActionFetcher, showToast);
  useFetcherToast(reorderFetcher, showToast);

  const handleReorderTasks = useCallback(
    (orderedIds: string[], parentId?: string | null) => {
      if (!canEdit || orderedIds.length === 0) return;
      if (!isLoggedIn && !isSharedServerList) {
        handleGuestAction("reorderTasks", { orderedIds, parentId: parentId ?? null });
        return;
      }
      const submitData: Record<string, string> = {
        intent: "reorderTasks",
        orderedIds: JSON.stringify(orderedIds),
      };
      if (parentId) {
        submitData.parentId = parentId;
      }
      reorderFetcher.submit(submitData, { method: "post" });
    },
    [canEdit, isLoggedIn, isSharedServerList, handleGuestAction, reorderFetcher]
  );

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

  const handleExportCompletionsCsv = async () => {
    try {
      const response = await fetch("/api/v1/completions/export");
      if (!response.ok) {
        showToast("Couldn't export completions");
        return;
      }
      const csvText = await response.text();
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", blobUrl);
      downloadAnchor.setAttribute("download", `synx_completions_${userId}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(blobUrl);
      showToast("✓ Exported completion log (CSV)!");
    } catch (err) {
      console.error("Failed to export completion CSV:", err);
      showToast("Couldn't export completions");
    }
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
  const prevActiveListId = useRef(effectiveActiveListId);

  useEffect(() => {
    if (prevActiveListId.current !== effectiveActiveListId) {
      prevActiveListId.current = effectiveActiveListId;
      prevCompletedCount.current = completedCount;
      prevTotalTodos.current = totalCount;
      setIsEditingTitle(false);
      setShowSharePopover(false);
      return;
    }

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
  }, [completedCount, totalCount, effectiveActiveListId]);

  const canArchive = canArchiveList({
    isLoggedIn,
    isOwner,
    hasSharedAccess: isLoggedIn && isSharedServerList,
  });
  const isActiveListArchived = Boolean(isLoggedIn && activeListMeta?.archived_at);
  const [savedDismissedArchivePrompts, setSavedDismissedArchivePrompts] = useStoredValue(
    ARCHIVE_PROMPT_DISMISSED_STORAGE_KEY
  );
  const dismissedArchivePrompts = useMemo(
    () => parseDismissedArchivePrompts(savedDismissedArchivePrompts),
    [savedDismissedArchivePrompts]
  );
  const isListNowCompleted = useMemo(
    () => isListCompleted(optimisticTodos),
    [optimisticTodos]
  );
  const archiveStateSettled = Boolean(hydrated && !isIndexRedirecting && effectiveActiveListId);
  const [archivePromptListId, setArchivePromptListId] = useState<string | null>(null);
  const [prevArchiveCheck, setPrevArchiveCheck] = useState<{
    listId: string | undefined;
    completed: boolean;
    settled: boolean;
  }>({
    listId: effectiveActiveListId,
    completed: isListNowCompleted,
    settled: archiveStateSettled,
  });

  if (
    prevArchiveCheck.listId !== effectiveActiveListId ||
    prevArchiveCheck.completed !== isListNowCompleted ||
    prevArchiveCheck.settled !== archiveStateSettled
  ) {
    const wasSettledSameList =
      archiveStateSettled &&
      prevArchiveCheck.settled &&
      prevArchiveCheck.listId === effectiveActiveListId;
    const wasCompleted = prevArchiveCheck.completed;

    setPrevArchiveCheck({
      listId: effectiveActiveListId,
      completed: isListNowCompleted,
      settled: archiveStateSettled,
    });

    if (!wasSettledSameList || !isListNowCompleted || !effectiveActiveListId) {
      if (archivePromptListId !== null) {
        setArchivePromptListId(null);
      }
    } else if (
      shouldSuggestArchivingList({
        wasCompleted,
        isNowCompleted: isListNowCompleted,
        isArchived: isActiveListArchived,
        canArchive,
        suggestionsEnabled: archiveSuggestionsEnabled,
        dismissedForCycle: dismissedArchivePrompts.has(effectiveActiveListId),
      })
    ) {
      setArchivePromptListId(effectiveActiveListId);
    }
  }

  useEffect(() => {
    if (!archiveStateSettled || !effectiveActiveListId || isListNowCompleted) return;
    if (dismissedArchivePrompts.has(effectiveActiveListId)) {
      setSavedDismissedArchivePrompts(
        serializeDismissedArchivePrompts(
          clearArchivePromptDismissed(dismissedArchivePrompts, effectiveActiveListId)
        )
      );
    }
  }, [
    archiveStateSettled,
    effectiveActiveListId,
    isListNowCompleted,
    dismissedArchivePrompts,
    setSavedDismissedArchivePrompts,
  ]);

  const handleDismissArchivePrompt = () => {
    if (!effectiveActiveListId) return;
    setArchivePromptListId(null);
    setSavedDismissedArchivePrompts(
      serializeDismissedArchivePrompts(
        markArchivePromptDismissed(dismissedArchivePrompts, effectiveActiveListId)
      )
    );
  };

  const handleArchiveList = (targetListId: string) => {
    if (!isLoggedIn || !targetListId) return;
    if (targetListId === effectiveActiveListId) {
      setArchivePromptListId(null);
    }
    if (dismissedArchivePrompts.has(targetListId)) {
      setSavedDismissedArchivePrompts(
        serializeDismissedArchivePrompts(
          clearArchivePromptDismissed(dismissedArchivePrompts, targetListId)
        )
      );
    }
    listFetcher.submit(
      { intent: "archiveList", listId: targetListId },
      { method: "post" }
    );
    showToast("✓ List archived");
  };

  const handleUnarchiveList = (targetListId: string) => {
    if (!isLoggedIn || !targetListId) return;
    listFetcher.submit(
      { intent: "unarchiveList", listId: targetListId },
      { method: "post" }
    );
    showToast("✓ List unarchived");
  };

  const showArchivePrompt =
    archivePromptListId === effectiveActiveListId &&
    isListNowCompleted &&
    !isActiveListArchived &&
    canArchive &&
    archiveSuggestionsEnabled &&
    !dismissedArchivePrompts.has(effectiveActiveListId);

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
          ownedPendingDeleteRequests={ownedPendingDeleteRequests}
          providerProfile={providerProfile}
          setListToDelete={setListToDelete}
          setListToRename={setListToRename}
          setRenameInput={setRenameInput}
          settingsFetcher={settingsFetcher}
          setIsCreateListOpen={setIsCreateListOpen}
          isLoggedIn={isLoggedIn}
          settings={settings}
          profileLabel={profileLabel}
          setIsProfileOpen={setIsProfileOpen}
          archiveSuggestionsEnabled={archiveSuggestionsEnabled}
          onArchiveList={handleArchiveList}
          onUnarchiveList={handleUnarchiveList}
        />

        {/* ── Main Area ─────────────────────────────────────── */}
        <main className="relative z-10 flex flex-col py-6 px-4 sm:px-5 md:px-6 lg:px-8 max-w-2xl mx-auto w-full min-w-0 md:max-w-none md:h-screen md:overflow-x-hidden md:overflow-y-auto">
          {isLoggedIn && (
            <Suspense fallback={null}>
              <Await resolve={ownedPendingDeleteRequests}>
                {(resolvedOwnedRequests: PendingDeleteRequest[] | undefined) => {
                  const requests = resolvedOwnedRequests || [];
                  if (requests.length === 0) return null;
                  return (
                    <section
                      className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3"
                      aria-label="Pending delete requests"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-amber-200">
                          Delete requests
                        </h2>
                        <span className="text-[10px] font-semibold text-amber-300/80">
                          {requests.length} pending
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {requests.map((req) => {
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
                  );
                }}
              </Await>
            </Suspense>
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
                            const isPreset = isPresetCategory(cat);
                            setEditCategorySelection(isPreset ? cat : "Custom");
                            setEditCustomCategoryInput(isPreset ? "" : cat);
                          }
                        }}
                        className={`text-xs px-2.5 py-0.5 rounded-full border border-themeAccentRing/30 bg-themeAccentBg text-themeAccentText font-semibold flex items-center gap-1 transition-all ${
                          isOwner ? "hover:border-themeAccentRing cursor-pointer" : "cursor-default"
                        }`}
                        title={isOwner ? "Edit Category Tag" : undefined}
                      >
                        <span>{getCategoryTagEmoji(cat)} {cat}</span>
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
                        setEditCategorySelection("");
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
              {canArchive && effectiveActiveListId && (
                isActiveListArchived ? (
                  <button
                    type="button"
                    data-testid="active-list-unarchive-button"
                    onClick={() => handleUnarchiveList(effectiveActiveListId)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                  >
                    Unarchive
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="active-list-archive-button"
                    aria-label="Archive list"
                    title="Archive list"
                    onClick={() => handleArchiveList(effectiveActiveListId)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:text-themeAccentText hover:border-themeAccentRing/40 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    <span className="hidden sm:inline">Archive</span>
                  </button>
                )
              )}
              <ProgressRing percent={progress.percent} />
            </div>
          </header>

          {canArchive && effectiveActiveListId && isActiveListArchived && (
            <div
              data-testid="archived-list-banner"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100"
            >
              <span>This list is archived — adding a task unarchives it for you.</span>
              <button
                type="button"
                data-testid="archived-banner-unarchive"
                onClick={() => handleUnarchiveList(effectiveActiveListId)}
                className="px-3 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 font-semibold border border-amber-300/30 transition-colors cursor-pointer"
              >
                Unarchive
              </button>
            </div>
          )}

          {showArchivePrompt && effectiveActiveListId && (
            <div
              data-testid="archive-suggestion-prompt"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100"
            >
              <span>All tasks done! Archive this list?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="archive-prompt-archive"
                  onClick={() => handleArchiveList(effectiveActiveListId)}
                  className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-colors cursor-pointer"
                >
                  Archive
                </button>
                <button
                  type="button"
                  data-testid="archive-prompt-not-now"
                  onClick={handleDismissArchivePrompt}
                  className="px-3 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 font-semibold transition-colors cursor-pointer"
                >
                  Not now
                </button>
              </div>
            </div>
          )}

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
            smartQuickAddEnabled={smartQuickAddEnabled}
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
            canEdit={canEdit}
            clearCompletedNeedsApproval={clearCompletedNeedsApproval}
            activeListShareMode={activeListShareMode}
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
              <CalendarView
                todos={optimisticTodos}
                activeListId={activeListId || ""}
                canEdit={canEdit}
                onNotify={showToast}
                onTaskCompleted={handleTaskCompletedFeedback}
                completionStatsByTodoId={completionStatsByTodoId}
                timerNow={timerNow}
                onTimerTick={setTimerNow}
                smartQuickAddEnabled={smartQuickAddEnabled}
              />
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
                {activeParents.map((todo) => {
                  const upInfo = canMoveTaskInDirection(activeParents, todo.id, "up", sortBy);
                  const downInfo = canMoveTaskInDirection(activeParents, todo.id, "down", sortBy);
                  return (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      subtasks={subtasksMap[todo.id] || []}
                      canEdit={canEdit}
                      onNotify={showToast}
                      onBeforeSetCompleted={maybePromptForCompletion}
                      onTaskCompleted={handleTaskCompletedFeedback}
                      completionStatsByTodoId={completionStatsByTodoId}
                      timerNow={timerNow}
                      onTimerTick={setTimerNow}
                      searchQuery={searchQuery}
                      sortBy={sortBy}
                      canMoveUp={upInfo.canMove}
                      canMoveDown={downInfo.canMove}
                      onMoveUp={() => upInfo.orderedIds && handleReorderTasks(upInfo.orderedIds)}
                      onMoveDown={() => downInfo.orderedIds && handleReorderTasks(downInfo.orderedIds)}
                      onReorderSubtasks={(parentId, orderedIds) =>
                        handleReorderTasks(orderedIds, parentId)
                      }
                    />
                  );
                })}
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
                      onBeforeSetCompleted={maybePromptForCompletion}
                      onTaskCompleted={handleTaskCompletedFeedback}
                      completionStatsByTodoId={completionStatsByTodoId}
                      timerNow={timerNow}
                      onTimerTick={setTimerNow}
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
          providerProfile={providerProfile}
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
          handleExportCompletionsCsv={handleExportCompletionsCsv}
          smartQuickAddEnabled={smartQuickAddEnabled}
          setSmartQuickAddEnabled={setSmartQuickAddEnabled}
          archiveSuggestionsEnabled={archiveSuggestionsEnabled}
          setArchiveSuggestionsEnabled={setArchiveSuggestionsEnabled}
        />

        {/* ── Owner Activity Log Modal ──────────────────────── */}
        <ActivityLogModal
          showActivityModal={showActivityModal}
          setShowActivityModal={setShowActivityModal}
          listActivity={loaderListActivity}
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

        <SubtaskCompletionModal
          prompt={subtaskPromptState}
          onConfirm={confirmSubtaskCompletion}
          onCancel={cancelSubtaskCompletion}
        />

        {isSubtaskCompletionSlowPending && (
          <div
            role="status"
            data-slow-pending="true"
            className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-lg text-xs font-medium text-amber-300 bg-slate-900/95 border border-amber-400/25 shadow-lg animate-pulse"
          >
            Saving…
          </div>
        )}

        {/* One-time display name offer outside Profile (Profile shows it inline). */}
        {isLoggedIn && pendingNameSuggestion && !isAnyModalOpen && !subtaskPromptState && (
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
        <Toast message={toast.message} visible={toast.visible} actions={toast.actions} />
      </div>
    </GuestContext.Provider>
  );
}
