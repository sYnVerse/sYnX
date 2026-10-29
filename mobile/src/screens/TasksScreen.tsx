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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  Search,
  RefreshCw,
  Plus,
  Check,
  Trash2,
  Clock,
  ListTree,
  Repeat,
  Pencil,
  FolderKanban,
  Bell,
  Flag,
  History,
} from "lucide-react-native";
import { apiClient } from "../api/client";
import {
  TodoItem,
  TodoList,
  describeListActivityAction,
  type ListAccessDenialCode,
  type ListActivityEntry,
  type PendingDeleteRequest,
  type PriorityLevel,
} from "../shared";
import { TaskModal } from "../components/TaskModal";
import { TaskBreakdownModal } from "../components/TaskBreakdownModal";
import { TaskCardSkeleton } from "../components/SkeletonLoader";
import { ListPermissionBanner } from "../components/ListPermissionBanner";
import { ListAccessErrorState, type ListAccessErrorKind } from "../components/ListAccessErrorState";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { syncTaskToNativeCalendar, removeTaskFromNativeCalendar } from "../services/calendar";
import { getCachedListName } from "../services/listNames";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChangelogModal } from "../components/ChangelogModal";
import { MOBILE_VERSION } from "../constants/changelog";
import { typography, spacing, MIN_TOUCH_TARGET, getFabBottomOffset, getListBottomPadding } from "../theme/theme";
import { formatReminderTime, priorityColor, priorityLabel, listOwnershipLabel } from "../utils/format";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";
import { useSetTodoCompleted } from "../hooks/useSetTodoCompleted";
import { syncActiveList, syncPinnedList } from "../services/widgetSync";
import { getPinnedWidgetConfig } from "../services/widgetPreferences";

export interface TasksScreenProps {
  listId: string;
  /** Set when a widget or quick-add link asked to open the new task form. */
  newTaskRequestId?: number;
  /** Called once the request has been handled so it isn't replayed on the next list open. */
  onNewTaskRequestHandled?: () => void;
  onGoToMyLists?: () => void;
  onSwitchLists?: () => void;
}

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
  const { showError, showSuccess, showToast } = useToast();
  const insets = useSafeAreaInsets();
  const fabBottom = getFabBottomOffset(insets.bottom);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TodoItem | null>(null);
  const [selectedTaskForBreakdown, setSelectedTaskForBreakdown] = useState<TodoItem | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

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
    enabled: !!listId && !!listMeta,
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
    enabled: !!listId && !!listMeta,
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

  const showingCachedWhileOffline = Boolean(todosIsError && rawTodos);

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

    return Object.values(parentMap);
  }, [rawTodos]);

  const triggerSuccessHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const onMutationError = (error: unknown, fallback: string) => {
    triggerErrorHaptic(hapticsEnabled);
    showError(getErrorMessage(error, fallback));
  };

  React.useEffect(() => {
    if (listId && listMeta) {
      refetch();
    }
  }, [listId, listMeta, refetch]);

  const { setCompleted, isPendingId } = useSetTodoCompleted(listId);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/api/v1/todos/${id}`);
      return {
        id,
        pendingApproval: Boolean(res.data?.pendingApproval),
        message: res.data?.message as string | undefined,
      };
    },
    onSuccess: (result) => {
      triggerImpactHaptic();
      if (result.pendingApproval) {
        showToast(
          result.message || "Delete request sent. The list owner must approve it.",
          "info"
        );
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old
            ? old.map((t) => (t.id === result.id ? { ...t, pendingDelete: true } : t))
            : []
        );
        queryClient.invalidateQueries({ queryKey: ["todos", listId] });
        queryClient.invalidateQueries({ queryKey: ["delete-requests", listId] });
        return;
      }
      if (result.id) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old ? old.filter((t) => t.id !== result.id && t.parentId !== result.id) : []
        );
        removeTaskFromNativeCalendar(result.id).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
      queryClient.invalidateQueries({ queryKey: ["delete-requests", listId] });
    },
    onError: (e) => onMutationError(e, "Couldn't delete task"),
  });

  const reviewDeleteMutation = useMutation({
    mutationFn: async ({
      requestId,
      decision,
    }: {
      requestId: string;
      decision: "approve" | "decline";
    }) => {
      const res = await apiClient.post(`/api/v1/delete-requests/${requestId}`, { decision });
      return res.data as { decision: string; listId?: string; targetType?: string };
    },
    onSuccess: (data) => {
      triggerSuccessHaptic();
      showSuccess(data.decision === "approve" ? "Delete approved" : "Delete declined");
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
      queryClient.invalidateQueries({ queryKey: ["delete-requests", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      if (data.targetType === "list") {
        queryClient.invalidateQueries({ queryKey: ["list_meta", listId] });
      }
    },
    onError: (e) => onMutationError(e, "Couldn't update delete request"),
  });

  const createMutation = useMutation({
    mutationFn: async (newTodo: any) => {
      const res = await apiClient.post("/api/v1/todos", { ...newTodo, listId });
      return res.data.todo as TodoItem;
    },
    onSuccess: (createdTodo) => {
      triggerSuccessHaptic();
      if (createdTodo) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old ? [...old, createdTodo] : [createdTodo]
        );
        syncTaskToNativeCalendar(createdTodo, {
          listName: getCachedListName(queryClient, createdTodo.listId),
        }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
    onError: (e) => onMutationError(e, "Couldn't create task"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await apiClient.put(`/api/v1/todos/${id}`, payload);
      return res.data.todo as TodoItem;
    },
    onSuccess: (updatedTodo) => {
      triggerSuccessHaptic();
      if (updatedTodo) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old ? old.map((t) => (t.id === updatedTodo.id ? updatedTodo : t)) : []
        );
        syncTaskToNativeCalendar(updatedTodo, {
          listName: getCachedListName(queryClient, updatedTodo.listId),
        }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
    onError: (e) => onMutationError(e, "Couldn't update task"),
  });

  const handleDeleteTask = (task: TodoItem) => {
    if (!canEdit || task.pendingDelete) return;
    triggerImpactHaptic();
    const title = isOwner ? "Delete Task" : "Request task deletion?";
    const message = isOwner
      ? `Are you sure you want to delete "${task.text}"?`
      : `Ask the owner to delete "${task.text}"? They'll need to approve before it's removed.`;
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isOwner ? "Delete" : "Send request",
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
  const [activityBefore, setActivityBefore] = useState<number | null>(null);

  const {
    data: activityPage,
    isFetching: activityFetching,
    isError: activityError,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: ["list-activity", listId, activityBefore],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (activityBefore != null) params.set("before", String(activityBefore));
      const res = await apiClient.get(`/api/v1/lists/${listId}/activity?${params.toString()}`);
      return {
        entries: (res.data.entries || []) as ListActivityEntry[],
        listName: res.data.listName as string | undefined,
      };
    },
    enabled: canViewActivity && showActivity,
  });

  const [activityEntries, setActivityEntries] = useState<ListActivityEntry[]>([]);
  React.useEffect(() => {
    if (!showActivity) {
      setActivityEntries([]);
      setActivityBefore(null);
      return;
    }
    if (!activityPage) return;
    setActivityEntries((prev) => {
      if (activityBefore == null) return activityPage.entries;
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...activityPage.entries.filter((e) => !seen.has(e.id))];
    });
  }, [activityPage, activityBefore, showActivity]);

  const activityHasMore = (activityPage?.entries.length ?? 0) >= 50;

  const filteredTodos = structuredTodos.filter((parent) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    const parentMatches = parent.text.toLowerCase().includes(q);
    const subtaskMatches = parent.subtasks?.some((st) => st.text.toLowerCase().includes(q));
    return parentMatches || subtaskMatches;
  });

  const ownerDisplayName = listMeta?.owner?.displayName ?? null;
  const ownershipLabel = listOwnershipLabel(isOwner, ownerDisplayName);

  if (listMetaLoading && !listMeta) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading list...</Text>
      </View>
    );
  }

  if (accessError) {
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
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchInputWrapper,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
            },
          ]}
        >
          <Search size={18} color={theme.inputPlaceholder} />
          <TextInput
            style={[styles.searchInput, { color: theme.textPrimary }]}
            placeholder="Search tasks..."
            placeholderTextColor={theme.inputPlaceholder}
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search tasks"
          />
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
          onPress={() => {
            triggerImpactHaptic();
            refetchListMeta();
            refetch();
          }}
          accessibilityRole="button"
          accessibilityLabel="Refresh tasks"
        >
          <RefreshCw size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

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
          <Text style={[styles.ownershipText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {ownershipLabel}
          </Text>
        </View>
        <View style={styles.listHeaderActions}>
          {canViewActivity ? (
            <TouchableOpacity
              style={[styles.switchListBtn, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
              onPress={() => {
                triggerImpactHaptic();
                setActivityBefore(null);
                setShowActivity(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="View activity"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <History size={16} color={theme.accent} />
              <Text style={[styles.switchListText, { color: theme.accent }]} maxFontSizeMultiplier={1.2}>
                Activity
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.switchListBtn, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
            onPress={() => {
              triggerImpactHaptic();
              onSwitchLists?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Switch lists"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FolderKanban size={16} color={theme.accent} />
            <Text style={[styles.switchListText, { color: theme.accent }]} maxFontSizeMultiplier={1.2}>
              Switch
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {listMeta ? (
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

      {isLoading && !rawTodos ? (
        <View style={{ paddingTop: 8 }}>
          <TaskCardSkeleton />
          <TaskCardSkeleton />
          <TaskCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={filteredTodos}
          keyExtractor={(item) => item.id}
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
          renderItem={({ item }) => {
            const subtaskCount = item.subtasks?.length || 0;
            const completedSubtasks = item.subtasks?.filter((s) => s.completed).length || 0;
            const prio = (item.priority || "none") as PriorityLevel;

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.todoCard,
                  {
                    backgroundColor: theme.cardBg,
                    borderColor: theme.cardBorder,
                    shadowColor: theme.shadowColor,
                  },
                ]}
                onPress={() => setSelectedTaskForBreakdown(item)}
                accessibilityRole="button"
                accessibilityLabel={`Task ${item.text}`}
              >
                <TouchableOpacity
                  disabled={!canEdit || isPendingId(item.id)}
                  style={[
                    styles.checkboxHit,
                    (!canEdit || isPendingId(item.id)) && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    if (!canEdit || isPendingId(item.id)) return;
                    setCompleted(item);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: item.completed,
                    disabled: !canEdit || isPendingId(item.id),
                  }}
                  accessibilityLabel={`Mark ${item.text} ${item.completed ? "incomplete" : "complete"}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: theme.accent },
                      item.completed && { backgroundColor: theme.accent },
                    ]}
                  >
                    {item.completed && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.todoText,
                      { color: theme.textPrimary },
                      item.completed && [styles.todoTextCompleted, { color: theme.textMuted }],
                    ]}
                    maxFontSizeMultiplier={1.45}
                  >
                    {item.text}
                  </Text>

                  <View style={styles.badgeRow}>
                    {prio !== "none" && (
                      <View
                        style={[
                          styles.pillBadge,
                          { backgroundColor: priorityColor(prio, theme) + "22" },
                        ]}
                      >
                        <Flag size={11} color={priorityColor(prio, theme)} />
                        <Text style={[styles.pillBadgeText, { color: priorityColor(prio, theme) }]}>
                          {priorityLabel(prio)}
                        </Text>
                      </View>
                    )}

                    {item.reminderAt ? (
                      <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
                        <Bell size={11} color={theme.accent} />
                        <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                          {formatReminderTime(item.reminderAt)}
                        </Text>
                      </View>
                    ) : null}

                    {item.durationMinutes ? (
                      <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
                        <Clock size={11} color={theme.accent} />
                        <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                          {item.durationMinutes} min
                        </Text>
                      </View>
                    ) : null}

                    {item.pendingDelete ? (
                      <View style={[styles.pillBadge, { backgroundColor: "rgba(245, 158, 11, 0.18)" }]}>
                        <Text style={[styles.pillBadgeText, { color: "#F59E0B" }]}>
                          Delete requested
                        </Text>
                      </View>
                    ) : null}

                    {item.recurrence !== "none" && (
                      <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
                        <Repeat size={11} color={theme.accent} />
                        <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                          {item.recurrence}
                        </Text>
                      </View>
                    )}

                    {subtaskCount > 0 && (
                      <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
                        <ListTree size={11} color={theme.accent} />
                        <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                          {completedSubtasks}/{subtaskCount} subtasks
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {canEdit && (
                  <>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => setEditingTask(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.text}`}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Pencil size={16} color={theme.textMuted} />
                    </TouchableOpacity>

                    {!item.pendingDelete && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleDeleteTask(item)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isOwner ? `Delete ${item.text}` : `Request delete for ${item.text}`
                        }
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Trash2 size={16} color={theme.danger} />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          }}
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
      />

      <TaskBreakdownModal
        visible={!!selectedTaskForBreakdown}
        task={selectedTaskForBreakdown}
        canEdit={canEdit}
        onClose={() => setSelectedTaskForBreakdown(null)}
      />

      <ChangelogModal visible={showChangelog} onClose={handleDismissChangelog} />

      <Modal
        visible={showActivity}
        animationType="slide"
        transparent
        onRequestClose={() => setShowActivity(false)}
      >
        <View style={styles.activityOverlay}>
          <TouchableOpacity
            style={styles.activityDismiss}
            activeOpacity={1}
            onPress={() => setShowActivity(false)}
            accessibilityLabel="Close activity"
          />
          <View
            style={[
              styles.activitySheet,
              { backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.activityTitle, { color: theme.textPrimary }]}>Activity</Text>
            <Text style={[styles.activitySubtitle, { color: theme.textMuted }]}>
              Who changed this shared list, and from which IP. Only you can see this.
            </Text>
            {activityFetching && activityEntries.length === 0 ? (
              <ActivityIndicator color={theme.accent} style={{ marginVertical: 24 }} />
            ) : activityError && activityEntries.length === 0 ? (
              <TouchableOpacity onPress={() => refetchActivity()} accessibilityRole="button">
                <Text style={[styles.activityEmpty, { color: theme.accent }]}>
                  Couldn't load activity. Tap to retry.
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
                    disabled={activityFetching}
                    onPress={() => {
                      const oldest = activityEntries[activityEntries.length - 1]?.createdAt;
                      if (oldest == null) return;
                      setActivityBefore(oldest);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Load more activity"
                  >
                    <Text style={[styles.activityLoadMoreText, { color: theme.accent }]}>
                      {activityFetching ? "Loading…" : "Load more"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.activityCloseBtn, { backgroundColor: theme.accent }]}
              onPress={() => setShowActivity(false)}
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
    gap: 10,
    marginBottom: 10,
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
  todoCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  checkboxHit: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  todoText: {
    fontSize: typography.md,
    fontWeight: "600",
  },
  todoTextCompleted: {
    textDecorationLine: "line-through",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  pillBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  actionBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
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
