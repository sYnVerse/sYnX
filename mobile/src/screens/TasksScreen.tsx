import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Search, Plus, FolderKanban, Pencil, X } from "lucide-react-native";
import { apiClient } from "../api/client";
import {
  TodoItem,
  TodoList,
  PRIORITY_LEVELS_DESC,
  PRIORITY_DROP_LABELS,
  canDragTaskForPriority,
  applyOptimisticTaskPriority,
  describeListActivityAction,
  resolveTaskSortMode,
  sortTasks,
  splitCompletedTasks,
  type ListAccessDenialCode,
  type ListActivityEntry,
  type PendingDeleteRequest,
  type PriorityLevel,
} from "../shared";
import { TaskModal } from "../components/TaskModal";
import { TaskRow } from "../components/TaskRow";
import { CompletedSectionHeader } from "../components/CompletedSectionHeader";
import { TaskBreakdownModal } from "../components/TaskBreakdownModal";
import { TaskCardSkeleton } from "../components/SkeletonLoader";
import { ListPermissionBanner } from "../components/ListPermissionBanner";
import { ListAccessErrorState, type ListAccessErrorKind } from "../components/ListAccessErrorState";
import { ListOptionsModal } from "../components/ListOptionsModal";
import { EditListModal } from "../components/EditListModal";
import { ShareListModal } from "../components/ShareListModal";
import { useTheme } from "../context/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTaskSortPreferences } from "../hooks/useTaskSortPreferences";
import { ChangelogModal } from "../components/ChangelogModal";
import { MOBILE_VERSION } from "../constants/changelog";
import { typography, spacing, MIN_TOUCH_TARGET, getFabBottomOffset, getListBottomPadding, getSheetBottomPadding } from "../theme/theme";
import { listOwnershipLabel, priorityColor } from "../utils/format";
import { useSetTodoCompleted } from "../hooks/useSetTodoCompleted";
import { useTaskMutations } from "../hooks/useTaskMutations";
import { syncActiveList, syncPinnedList } from "../services/widgetSync";
import { getPinnedWidgetConfig, setPinnedWidgetConfig, type PinnedWidgetConfig } from "../services/widgetPreferences";
import { useToast } from "../context/ToastContext";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";

export interface TasksScreenProps {
  listId: string;
  /** Set when a widget or quick-add link asked to open the new task form. */
  newTaskRequestId?: number;
  /** Called once the request has been handled so it isn't replayed on the next list open. */
  onNewTaskRequestHandled?: () => void;
  onGoToMyLists?: () => void;
  onSwitchLists?: () => void;
}

/** A row in the task list: a task, or the header of the collapsible Completed section. */
type TaskListRow =
  | { kind: "task"; task: TodoItem }
  | { kind: "completed-header"; count: number };

function classifyListMetaError(error: unknown): {
  kind: ListAccessErrorKind;
  requiresAuth?: boolean;
} {
  const err = error as {
    response?: { status?: number; data?: { code?: string; requiresAuth?: boolean; error?: string } };
    message?: string;
    code?: string;
  };
  const status = err?.response?.status;
  const code = err?.response?.data?.code as ListAccessDenialCode | undefined;

  if (!err?.response) {
    return { kind: "NETWORK" };
  }
  if (status === 404 || code === "NOT_FOUND") {
    return { kind: "NOT_FOUND" };
  }
  if (status === 403 || code === "PRIVATE_LIST" || code === "ACCESS_DENIED") {
    return {
      kind: code === "ACCESS_DENIED" ? "ACCESS_DENIED" : "PRIVATE_LIST",
      requiresAuth: Boolean(err.response?.data?.requiresAuth),
    };
  }
  return { kind: "UNKNOWN" };
}

export const TasksScreen: React.FC<TasksScreenProps> = ({
  listId,
  newTaskRequestId,
  onNewTaskRequestHandled,
  onGoToMyLists,
  onSwitchLists,
}) => {
  const { theme, hapticsEnabled } = useTheme();
  const { showToast, showError } = useToast();
  const insets = useSafeAreaInsets();
  const fabBottom = getFabBottomOffset(insets.bottom);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TodoItem | null>(null);
  const [selectedTaskForBreakdown, setSelectedTaskForBreakdown] = useState<TodoItem | null>(null);
  const [showListOptionsModal, setShowListOptionsModal] = useState(false);
  const [showEditListModal, setShowEditListModal] = useState(false);
  const [showShareListModal, setShowShareListModal] = useState(false);
  const [pinnedConfig, setPinnedConfig] = useState<PinnedWidgetConfig | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [draggingTask, setDraggingTask] = useState<TodoItem | null>(null);
  const [dragPreviewPriority, setDragPreviewPriority] = useState<PriorityLevel | null>(null);
  const lastPreviewPriorityRef = React.useRef<PriorityLevel | null>(null);

  React.useEffect(() => {
    getPinnedWidgetConfig().then(setPinnedConfig).catch(() => {});
  }, [listId]);
  // The Completed section starts collapsed and isn't remembered; opening another list collapses it.
  const [completedOpenListId, setCompletedOpenListId] = useState<string | null>(null);
  const completedOpen = completedOpenListId === listId;
  const taskSortPrefs = useTaskSortPreferences();
  const taskSortMode = resolveTaskSortMode(taskSortPrefs.appDefault, taskSortPrefs.overrides[listId]);

  React.useEffect(() => {
    async function checkChangelogVersion() {
      try {
        const lastSeen = await AsyncStorage.getItem("last_seen_changelog_version");
        if (lastSeen !== MOBILE_VERSION) {
          setShowChangelog(true);
        }
      } catch (e) {
        console.error("Failed to read changelog version", e);
      }
    }
    checkChangelogVersion();
  }, []);

  const handleDismissChangelog = async () => {
    try {
      await AsyncStorage.setItem("last_seen_changelog_version", MOBILE_VERSION);
    } catch {
      // Best effort; the dialog still closes.
    }
    setShowChangelog(false);
  };

  const {
    data: listMeta,
    error: listMetaError,
    isLoading: listMetaLoading,
    isError: listMetaIsError,
    refetch: refetchListMeta,
  } = useQuery({
    queryKey: ["list_meta", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/lists/${listId}`);
      return res.data.list as TodoList;
    },
    placeholderData: () =>
      queryClient.getQueryData<TodoList[]>(["lists", "all"])?.find((l) => l.id === listId),
    enabled: !!listId,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 404) return false;
      return failureCount < 2;
    },
  });

  const canEdit = listMeta?.canEdit === true;
  const isOwner = listMeta?.isOwner === true;
  const shareMode = listMeta?.shareMode ?? "private";

  // Open the new task form for a widget or quick-add request once the list has
  // loaded (or failed). Done during render (React's "adjust state when a prop
  // changes" pattern), then the parent is told in an effect that it was used up.
  const [handledNewTaskId, setHandledNewTaskId] = useState<number | null>(null);
  const listMetaSettled = !listMetaLoading && (!!listMeta || listMetaIsError);
  if (newTaskRequestId && newTaskRequestId !== handledNewTaskId && listMetaSettled) {
    setHandledNewTaskId(newTaskRequestId);
    if (listMeta && canEdit) {
      setEditingTask(null);
      setModalVisible(true);
    }
  }
  React.useEffect(() => {
    if (handledNewTaskId !== null) onNewTaskRequestHandled?.();
  }, [handledNewTaskId, onNewTaskRequestHandled]);

  const accessError = listMetaIsError ? classifyListMetaError(listMetaError) : null;

  const {
    data: rawTodos,
    refetch,
    isRefetching,
    isLoading,
    isError: todosIsError,
    error: todosError,
    isFetching,
  } = useQuery({
    queryKey: ["todos", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/todos?listId=${listId}`);
      // Keep pending requests in a sibling cache key (same response).
      queryClient.setQueryData(
        ["delete-requests", listId],
        (res.data.pendingDeleteRequests || []) as PendingDeleteRequest[]
      );
      return res.data.todos as TodoItem[];
    },
    enabled: !!listId && (!!listMeta || !listMetaIsError),
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 404) return false;
      return failureCount < 2;
    },
  });

  const { data: pendingDeleteRequests = [] } = useQuery({
    queryKey: ["delete-requests", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/delete-requests?listId=${listId}`);
      return (res.data.requests || []) as PendingDeleteRequest[];
    },
    enabled: !!listId && (!!listMeta || !listMetaIsError),
  });

  React.useEffect(() => {
    if (listMeta && rawTodos) {
      syncActiveList(listId, listMeta, rawTodos, queryClient).catch(() => {});
      getPinnedWidgetConfig()
        .then((cfg) => {
          if (cfg?.listId === listId) {
            syncPinnedList(listId, listMeta, rawTodos, queryClient).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [listId, listMeta, rawTodos, queryClient]);

  const showingCachedWhileOffline = Boolean(
    (todosIsError || accessError?.kind === "NETWORK") && (rawTodos || listMeta)
  );

  const structuredTodos = useMemo(() => {
    if (!rawTodos) return [];
    const parentMap: Record<string, TodoItem & { subtasks: TodoItem[] }> = {};
    const children: TodoItem[] = [];

    rawTodos.forEach((t) => {
      if (!t.parentId) {
        parentMap[t.id] = { ...t, subtasks: [] };
      } else {
        children.push(t);
      }
    });

    children.forEach((st) => {
      if (st.parentId && parentMap[st.parentId]) {
        parentMap[st.parentId].subtasks.push(st);
      }
    });

    return sortTasks(Object.values(parentMap), taskSortMode);
  }, [rawTodos, taskSortMode]);

  const triggerImpactHaptic = React.useCallback(() => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [hapticsEnabled]);

  const hasListMeta = Boolean(listMeta);
  React.useEffect(() => {
    if (listId && hasListMeta) {
      refetch();
    }
  }, [listId, hasListMeta, refetch]);

  const { setCompleted, isPendingId } = useSetTodoCompleted(listId);
  const { createMutation, updateMutation, deleteMutation, reviewDeleteMutation } =
    useTaskMutations(listId);

  const handlePriorityDragStart = React.useCallback(
    (task: TodoItem) => {
      triggerImpactHaptic();
      const initial = (task.priority || "none") as PriorityLevel;
      lastPreviewPriorityRef.current = initial;
      setDraggingTask(task);
      setDragPreviewPriority(initial);
    },
    [triggerImpactHaptic]
  );

  const handlePriorityDragHover = React.useCallback(
    (_task: TodoItem, preview: PriorityLevel) => {
      if (lastPreviewPriorityRef.current !== preview) {
        lastPreviewPriorityRef.current = preview;
        triggerImpactHaptic();
        setDragPreviewPriority(preview);
      }
    },
    [triggerImpactHaptic]
  );

  const handlePriorityDragEnd = React.useCallback(
    (task: TodoItem, nextPriority: PriorityLevel) => {
      lastPreviewPriorityRef.current = null;
      setDraggingTask(null);
      setDragPreviewPriority(null);
      const currentPriority = (task.priority || "none") as PriorityLevel;
      if (currentPriority === nextPriority) return;
      triggerImpactHaptic();
      const previous = queryClient.getQueryData<TodoItem[]>(["todos", listId]);
      queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
        applyOptimisticTaskPriority(old, task.id, nextPriority)
      );
      updateMutation.mutate(
        { id: task.id, payload: { priority: nextPriority } },
        {
          onError: () => {
            if (previous !== undefined) {
              queryClient.setQueryData(["todos", listId], previous);
            }
            void queryClient.invalidateQueries({ queryKey: ["todos", listId] });
          },
        }
      );
    },
    [listId, queryClient, triggerImpactHaptic, updateMutation]
  );

  const handlePriorityDragCancel = React.useCallback(() => {
    lastPreviewPriorityRef.current = null;
    setDraggingTask(null);
    setDragPreviewPriority(null);
  }, []);

  const handleDeleteTask = (task: TodoItem) => {
    if (!canEdit || task.pendingDelete) return;
    triggerImpactHaptic();
    // Collaborators delete tasks they added right away; others need approval.
    const deletesDirectly = isOwner || Boolean(task.canDeleteDirectly);
    const title = deletesDirectly ? "Delete Task" : "Request task deletion?";
    const message = deletesDirectly
      ? `Are you sure you want to delete "${task.text}"?`
      : `Ask the owner to delete "${task.text}"? They'll need to approve before it's removed.`;
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: deletesDirectly ? "Delete" : "Send request",
        style: "destructive",
        onPress: () => deleteMutation.mutate(task.id),
      },
    ]);
  };

  const ownerPendingRequests = useMemo(
    () => (isOwner ? pendingDeleteRequests : []),
    [isOwner, pendingDeleteRequests]
  );

  const canViewActivity = isOwner && shareMode !== "private";
  const [showActivity, setShowActivity] = useState(false);
  const [activityEntries, setActivityEntries] = useState<ListActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityError, setActivityError] = useState(false);

  const loadActivity = async (before: number | null, replace: boolean) => {
    setActivityLoading(true);
    setActivityError(false);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (before != null) params.set("before", String(before));
      const res = await apiClient.get(`/api/v1/lists/${listId}/activity?${params.toString()}`);
      const entries = (res.data.entries || []) as ListActivityEntry[];
      setActivityEntries((prev) => {
        if (replace) return entries;
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...entries.filter((e) => !seen.has(e.id))];
      });
      setActivityHasMore(entries.length >= 50);
    } catch {
      setActivityError(true);
    } finally {
      setActivityLoading(false);
    }
  };

  const openActivity = () => {
    triggerImpactHaptic();
    setActivityEntries([]);
    setActivityHasMore(false);
    setActivityError(false);
    setShowActivity(true);
    void loadActivity(null, true);
  };

  const closeActivity = () => {
    setShowActivity(false);
    setActivityEntries([]);
    setActivityHasMore(false);
    setActivityError(false);
  };

  const filteredTodos = structuredTodos.filter((parent) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    const parentMatches = parent.text.toLowerCase().includes(q);
    const subtaskMatches = parent.subtasks?.some((st) => st.text.toLowerCase().includes(q));
    return parentMatches || subtaskMatches;
  });

  // Completed tasks go in a collapsible section at the bottom, in the same sort order.
  const { active: activeTodos, completed: completedTodos } = splitCompletedTasks(filteredTodos);
  const taskRows: TaskListRow[] = activeTodos.map((task) => ({ kind: "task", task }));
  if (completedTodos.length > 0) {
    taskRows.push({ kind: "completed-header", count: completedTodos.length });
    if (completedOpen) {
      completedTodos.forEach((task) => taskRows.push({ kind: "task", task }));
    }
  }

  const ownerDisplayName = listMeta?.owner?.displayName ?? null;
  const ownershipLabel = listOwnershipLabel(isOwner, ownerDisplayName);

  if (listMetaLoading && !listMeta && !rawTodos) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading list...</Text>
      </View>
    );
  }

  if (accessError && !(accessError.kind === "NETWORK" && (rawTodos || listMeta))) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ListAccessErrorState
          kind={accessError.kind}
          requiresAuth={accessError.requiresAuth}
          onRetry={() => {
            refetchListMeta();
          }}
          onGoToMyLists={onGoToMyLists}
        />
      </View>
    );
  }

  if (todosIsError && !rawTodos) {
    const classified = classifyListMetaError(todosError);
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ListAccessErrorState
          kind={classified.kind}
          onRetry={() => refetch()}
          onGoToMyLists={onGoToMyLists}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* List context header */}
      <View style={styles.listHeader}>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.listTitle, { color: theme.textPrimary }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
          >
            {listMeta?.name || "List"}
          </Text>
          {!isOwner && ownershipLabel ? (
            <Text style={[styles.ownershipText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
              {ownershipLabel}
            </Text>
          ) : null}
        </View>
        <View style={styles.listHeaderActions}>
          <TouchableOpacity
            style={[
              styles.headerIconBtn,
              {
                backgroundColor: searchVisible ? theme.accentLight : theme.inputBg,
                borderColor: searchVisible ? theme.accent : theme.inputBorder,
              },
            ]}
            onPress={() => {
              triggerImpactHaptic();
              setSearchVisible((prev) => {
                if (prev) setSearch("");
                return !prev;
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Search tasks"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Search size={18} color={searchVisible ? theme.accent : theme.textSecondary} />
          </TouchableOpacity>

          {listMeta ? (
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
              onPress={() => {
                triggerImpactHaptic();
                setShowListOptionsModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`List options for ${listMeta.name}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Pencil size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
            onPress={() => {
              triggerImpactHaptic();
              onSwitchLists?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Switch lists"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FolderKanban size={18} color={theme.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable Search Input Row */}
      {searchVisible ? (
        <View style={[styles.searchRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
          <Search size={18} color={theme.inputPlaceholder} />
          <TextInput
            style={[styles.searchInput, { color: theme.textPrimary }]}
            placeholder="Search tasks..."
            placeholderTextColor={theme.inputPlaceholder}
            value={search}
            onChangeText={setSearch}
            autoFocus
            accessibilityLabel="Search tasks"
          />
          {search.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearch("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {listMeta && shareMode !== "private" ? (
        <ListPermissionBanner
          shareMode={shareMode}
          isOwner={isOwner}
          canEdit={canEdit}
          ownerDisplayName={ownerDisplayName}
        />
      ) : null}

      {ownerPendingRequests.length > 0 ? (
        <View
          style={[
            styles.pendingRequestsPanel,
            { backgroundColor: theme.accentLight, borderColor: theme.accent },
          ]}
          accessibilityRole="summary"
        >
          <Text style={[styles.pendingRequestsTitle, { color: theme.accent }]}>
            Delete requests ({ownerPendingRequests.length})
          </Text>
          {ownerPendingRequests.map((req) => {
            const label =
              req.targetType === "task"
                ? req.targetLabel
                  ? `Delete task "${req.targetLabel}"`
                  : "Delete a task"
                : req.targetType === "clear_completed"
                  ? "Clear completed tasks"
                  : "Delete this list";
            return (
              <View key={req.id} style={styles.pendingRequestRow}>
                <Text
                  style={[styles.pendingRequestLabel, { color: theme.textPrimary }]}
                  numberOfLines={2}
                >
                  {label}
                </Text>
                <View style={styles.pendingRequestActions}>
                  <TouchableOpacity
                    style={[styles.pendingActionBtn, { backgroundColor: theme.accent }]}
                    onPress={() =>
                      reviewDeleteMutation.mutate({ requestId: req.id, decision: "approve" })
                    }
                    disabled={reviewDeleteMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Approve ${label}`}
                  >
                    <Text style={styles.pendingActionApproveText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pendingActionBtn, { backgroundColor: theme.inputBg }]}
                    onPress={() =>
                      reviewDeleteMutation.mutate({ requestId: req.id, decision: "decline" })
                    }
                    disabled={reviewDeleteMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Decline ${label}`}
                  >
                    <Text style={[styles.pendingActionDeclineText, { color: theme.textSecondary }]}>
                      Decline
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {showingCachedWhileOffline ? (
        <View
          style={[styles.offlineBanner, { backgroundColor: theme.accentLight }]}
          accessibilityRole="text"
        >
          <Text style={[styles.offlineText, { color: theme.accent }]}>
            Offline — showing a cached copy. Pull to retry.
          </Text>
        </View>
      ) : null}

      {draggingTask ? (
        <View
          pointerEvents="none"
          style={[
            styles.priorityDropBar,
            { backgroundColor: theme.cardBg, borderColor: theme.accent },
          ]}
          accessibilityLabel="Priority drop targets"
        >
          <Text style={[styles.priorityDropLabel, { color: theme.textSecondary }]}>
            Release to set priority for &ldquo;{draggingTask.text}&rdquo;:
          </Text>
          <View style={styles.priorityDropChips}>
            {PRIORITY_LEVELS_DESC.map((level) => {
              const isSelected = dragPreviewPriority === level;
              const chipTint =
                level === "none" ? theme.textSecondary : priorityColor(level, theme);
              return (
                <View
                  key={level}
                  style={[
                    styles.priorityDropChip,
                    {
                      borderColor: isSelected ? chipTint : theme.cardBorder,
                      backgroundColor: isSelected ? `${chipTint}22` : theme.inputBg,
                    },
                  ]}
                  accessibilityLabel={PRIORITY_DROP_LABELS[level]}
                >
                  <Text
                    style={[
                      styles.priorityDropChipText,
                      { color: isSelected ? chipTint : theme.textPrimary },
                    ]}
                  >
                    {PRIORITY_DROP_LABELS[level]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {isLoading && !rawTodos ? (
        <View style={{ paddingTop: 8 }}>
          <TaskCardSkeleton />
          <TaskCardSkeleton />
          <TaskCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={taskRows}
          scrollEnabled={!draggingTask}
          keyExtractor={(row) => (row.kind === "task" ? row.task.id : "completed-header")}
          contentContainerStyle={{ paddingBottom: getListBottomPadding(insets.bottom) }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching || (isFetching && !isLoading)}
              onRefresh={() => {
                refetchListMeta();
                refetch();
              }}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {todosIsError ? (
                <>
                  <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Couldn&apos;t load tasks</Text>
                  <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                    Check your connection and try again.
                  </Text>
                  <TouchableOpacity
                    style={[styles.retryBtn, { backgroundColor: theme.accent }]}
                    onPress={() => refetch()}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading tasks"
                  >
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No tasks found</Text>
                  <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                    {canEdit
                      ? "Tap the + button to add your first task to this list."
                      : "No tasks in this shared list yet."}
                  </Text>
                </>
              )}
            </View>
          }
          renderItem={({ item: row }) =>
            row.kind === "completed-header" ? (
              <CompletedSectionHeader
                count={row.count}
                expanded={completedOpen}
                onToggle={() => {
                  triggerImpactHaptic();
                  setCompletedOpenListId(completedOpen ? null : listId);
                }}
              />
            ) : (
              <TaskRow
                item={row.task}
                canEdit={canEdit}
                isOwner={isOwner}
                isPending={isPendingId(row.task.id)}
                canDragPriority={canDragTaskForPriority({
                  canEdit,
                  sortMode: taskSortMode,
                  task: row.task,
                })}
                isDraggingPriority={draggingTask?.id === row.task.id}
                dragPreviewPriority={
                  draggingTask?.id === row.task.id ? dragPreviewPriority : null
                }
                onPriorityDragStart={handlePriorityDragStart}
                onPriorityDragHover={handlePriorityDragHover}
                onPriorityDragEnd={handlePriorityDragEnd}
                onPriorityDragCancel={handlePriorityDragCancel}
                onToggleCompleted={(task) => setCompleted(task)}
                onEdit={setEditingTask}
                onOpenSubtasks={setSelectedTaskForBreakdown}
              />
            )
          }
        />
      )}

      {canEdit && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.accent, bottom: fabBottom }]}
          onPress={() => {
            triggerImpactHaptic();
            setEditingTask(null);
            setModalVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add task"
        >
          <Plus size={26} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      <TaskModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={async (task) => {
          if (!canEdit) return;
          await createMutation.mutateAsync(task);
        }}
      />

      <TaskModal
        visible={!!editingTask}
        isEditing
        initialText={editingTask?.text}
        initialPriority={editingTask?.priority}
        initialRecurrence={editingTask?.recurrence}
        initialDurationMinutes={editingTask?.durationMinutes}
        initialReminderAt={editingTask?.reminderAt}
        onClose={() => setEditingTask(null)}
        onSave={async (updated) => {
          if (editingTask && canEdit) {
            await updateMutation.mutateAsync({ id: editingTask.id, payload: updated });
          }
        }}
        onDelete={async () => {
          if (editingTask) {
            handleDeleteTask(editingTask);
          }
        }}
      />

      <TaskBreakdownModal
        visible={!!selectedTaskForBreakdown}
        task={selectedTaskForBreakdown}
        canEdit={canEdit}
        sortMode={taskSortMode}
        onClose={() => setSelectedTaskForBreakdown(null)}
      />

      <ListOptionsModal
        visible={showListOptionsModal}
        list={listMeta ?? null}
        taskCount={structuredTodos.length}
        isPinned={pinnedConfig?.listId === listId}
        onClose={() => setShowListOptionsModal(false)}
        onTogglePin={async () => {
          if (!listMeta) return;
          triggerImpactHaptic();
          const isPinned = pinnedConfig?.listId === listMeta.id;
          if (isPinned) {
            await setPinnedWidgetConfig(null);
            setPinnedConfig(null);
            await syncPinnedList(null);
            showToast("Unpinned from widget", "info");
          } else {
            const newConfig: PinnedWidgetConfig = { mode: "list", listId: listMeta.id };
            await setPinnedWidgetConfig(newConfig);
            setPinnedConfig(newConfig);
            await syncPinnedList(listMeta.id, listMeta, rawTodos, queryClient);
            showToast(`Pinned "${listMeta.name}" to widget`, "success");
          }
        }}
        onShareAccess={() => setShowShareListModal(true)}
        onEditDetails={() => setShowEditListModal(true)}
        onViewActivity={canViewActivity ? openActivity : undefined}
        onDeleteList={() => {
          if (!listMeta) return;
          triggerImpactHaptic();
          const isListOwner = listMeta.isOwner !== false;
          const title = isListOwner ? "Delete List" : "Request list deletion?";
          const message = isListOwner
            ? `Are you sure you want to delete "${listMeta.name}" and all its tasks?`
            : `Ask the owner to delete "${listMeta.name}"? They'll need to approve before the list is removed.`;
          Alert.alert(title, message, [
            { text: "Cancel", style: "cancel" },
            {
              text: isListOwner ? "Delete" : "Send request",
              style: "destructive",
              onPress: async () => {
                try {
                  const res = await apiClient.delete(`/api/v1/lists/${listId}`);
                  if (res.data?.pendingApproval) {
                    showToast(
                      res.data?.message || "Delete request sent. The list owner must approve it.",
                      "success"
                    );
                    queryClient.invalidateQueries({ queryKey: ["delete-requests", listId] });
                    return;
                  }
                  if (pinnedConfig?.listId === listId) {
                    await setPinnedWidgetConfig(null);
                    setPinnedConfig(null);
                    await syncPinnedList(null);
                  }
                  queryClient.setQueryData<TodoList[]>(["lists", "all"], (old) =>
                    old ? old.filter((l) => l.id !== listId) : []
                  );
                  queryClient.invalidateQueries({ queryKey: ["lists"] });
                  queryClient.invalidateQueries({ queryKey: ["todos", listId] });
                  showToast("List deleted", "info");
                  onGoToMyLists?.() ?? onSwitchLists?.();
                } catch (e) {
                  triggerErrorHaptic(hapticsEnabled);
                  showError(getErrorMessage(e, "Couldn't delete list"));
                }
              },
            },
          ]);
        }}
      />

      <EditListModal
        visible={showEditListModal}
        list={listMeta ?? null}
        onClose={() => setShowEditListModal(false)}
      />

      <ShareListModal
        visible={showShareListModal}
        list={listMeta ?? null}
        onClose={() => setShowShareListModal(false)}
      />

      <ChangelogModal visible={showChangelog} onClose={handleDismissChangelog} />

      <Modal
        visible={showActivity}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeActivity}
      >
        <View style={styles.activityOverlay}>
          <TouchableOpacity
            style={styles.activityDismiss}
            activeOpacity={1}
            onPress={closeActivity}
            accessibilityLabel="Close activity"
          />
          <View
            style={[
              styles.activitySheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.cardBorder,
                paddingBottom: getSheetBottomPadding(insets.bottom, spacing.lg),
              },
            ]}
          >
            <Text style={[styles.activityTitle, { color: theme.textPrimary }]}>Activity</Text>
            <Text style={[styles.activitySubtitle, { color: theme.textMuted }]}>
              Who changed this shared list, and from which IP. Only you can see this.
            </Text>
            {activityLoading && activityEntries.length === 0 ? (
              <ActivityIndicator color={theme.accent} style={{ marginVertical: 24 }} />
            ) : activityError && activityEntries.length === 0 ? (
              <TouchableOpacity
                onPress={() => void loadActivity(null, true)}
                accessibilityRole="button"
              >
                <Text style={[styles.activityEmpty, { color: theme.accent }]}>
                  {"Couldn't load activity. Tap to retry."}
                </Text>
              </TouchableOpacity>
            ) : (
              <ScrollView style={styles.activityScroll} contentContainerStyle={{ paddingBottom: 16 }}>
                {activityEntries.length === 0 ? (
                  <Text style={[styles.activityEmpty, { color: theme.textMuted }]}>
                    No activity yet on this shared list.
                  </Text>
                ) : (
                  activityEntries.map((entry) => (
                    <View
                      key={entry.id}
                      style={[
                        styles.activityRow,
                        { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                      ]}
                    >
                      <View style={styles.activityRowHeader}>
                        <Text style={[styles.activityAction, { color: theme.textPrimary }]}>
                          {describeListActivityAction(entry.action)}
                        </Text>
                        <Text style={[styles.activityWhen, { color: theme.textMuted }]}>
                          {new Date(entry.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      <Text style={[styles.activityActor, { color: theme.textSecondary }]}>
                        {entry.actorLabel}
                        {entry.actorType !== "owner" ? ` · ${entry.actorType}` : ""}
                      </Text>
                      {entry.summary ? (
                        <Text style={[styles.activitySummary, { color: theme.textMuted }]}>
                          {entry.summary}
                        </Text>
                      ) : null}
                      {entry.clientIp ? (
                        <Text style={[styles.activityIp, { color: theme.textMuted }]}>
                          IP {entry.clientIp}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
                {activityHasMore && activityEntries.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.activityLoadMore, { backgroundColor: theme.accentLight }]}
                    disabled={activityLoading}
                    onPress={() => {
                      const oldest = activityEntries[activityEntries.length - 1]?.createdAt;
                      if (oldest == null) return;
                      void loadActivity(oldest, false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Load more activity"
                  >
                    <Text style={[styles.activityLoadMoreText, { color: theme.accent }]}>
                      {activityLoading ? "Loading…" : "Load more"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.activityCloseBtn, { backgroundColor: theme.accent }]}
              onPress={closeActivity}
              accessibilityRole="button"
              accessibilityLabel="Close activity"
            >
              <Text style={styles.activityCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: typography.sm,
    fontWeight: "500",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
    marginBottom: 10,
  },
  headerIconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  listHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  listTitle: {
    fontSize: typography.xl,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  ownershipText: {
    fontSize: typography.sm,
    fontWeight: "500",
    marginTop: 2,
  },
  switchListBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET,
  },
  switchListText: {
    fontSize: typography.sm,
    fontWeight: "700",
  },
  activityOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  activityDismiss: {
    flex: 1,
  },
  activitySheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    maxHeight: "80%",
  },
  activityTitle: {
    fontSize: typography.lg,
    fontWeight: "800",
  },
  activitySubtitle: {
    fontSize: typography.xs,
    fontWeight: "500",
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  activityScroll: {
    maxHeight: 420,
  },
  activityEmpty: {
    fontSize: typography.sm,
    textAlign: "center",
    paddingVertical: 24,
  },
  activityRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  activityRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  activityAction: {
    fontSize: typography.sm,
    fontWeight: "700",
    flex: 1,
  },
  activityWhen: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  activityActor: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  activitySummary: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  activityIp: {
    fontSize: typography.xs,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  activityLoadMore: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
    minHeight: MIN_TOUCH_TARGET,
  },
  activityLoadMoreText: {
    fontSize: typography.sm,
    fontWeight: "700",
  },
  activityCloseBtn: {
    marginTop: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    minHeight: MIN_TOUCH_TARGET,
  },
  activityCloseText: {
    color: "#FFFFFF",
    fontSize: typography.sm,
    fontWeight: "800",
  },
  offlineBanner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  offlineText: {
    fontSize: typography.xs,
    fontWeight: "600",
    textAlign: "center",
  },
  priorityDropBar: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    zIndex: 20,
    elevation: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  priorityDropLabel: {
    fontSize: typography.xs,
    fontWeight: "700",
  },
  priorityDropChips: {
    flexDirection: "row",
    gap: 8,
  },
  priorityDropChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
  },
  priorityDropChipText: {
    fontSize: typography.xs,
    fontWeight: "700",
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sm,
    height: "100%",
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET + 2,
    height: MIN_TOUCH_TARGET + 2,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: typography.lg,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptySub: {
    fontSize: typography.sm,
    textAlign: "center",
    maxWidth: 240,
  },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: getFabBottomOffset(0),
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  pendingRequestsPanel: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: 8,
  },
  pendingRequestsTitle: {
    fontSize: typography.xs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  pendingRequestRow: {
    gap: 8,
  },
  pendingRequestLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  pendingRequestActions: {
    flexDirection: "row",
    gap: 8,
  },
  pendingActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: MIN_TOUCH_TARGET - 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingActionApproveText: {
    color: "#FFFFFF",
    fontSize: typography.sm,
    fontWeight: "700",
  },
  pendingActionDeclineText: {
    fontSize: typography.sm,
    fontWeight: "700",
  },
});
