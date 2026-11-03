import type { ListActionHandler } from "./context";
import {
  handleAcceptSuggestedDisplayName,
  handleApproveDeleteRequest,
  handleDeclineDeleteRequest,
  handleDismissSuggestedDisplayName,
  handleInitTimeZone,
  handleListActivity,
  handleMigrateGuestLists,
  handleRemoveSharedList,
  handleSetTimeZone,
  handleUpdateSettings,
} from "./account.server";
import {
  handleClearCompleted,
  handleCreateTask,
  handleDeleteTask,
  handleSetCompleted,
  handleToggleTask,
} from "./tasks.server";
import {
  handleMarkReminderSent,
  handleUpdateDuration,
  handleUpdatePriority,
  handleUpdateRecurrence,
  handleUpdateReminder,
  handleUpdateText,
} from "./task-fields.server";
import {
  handleCreateList,
  handleDeleteList,
  handleRenameList,
  handleUpdateListCategory,
  handleUpdateShareMode,
} from "./lists.server";

export const ACCOUNT_INTENTS: Record<string, ListActionHandler> = {
  listActivity: handleListActivity,
  migrateGuestLists: handleMigrateGuestLists,
  setTimeZone: handleSetTimeZone,
  initTimeZone: handleInitTimeZone,
  acceptSuggestedDisplayName: handleAcceptSuggestedDisplayName,
  dismissSuggestedDisplayName: handleDismissSuggestedDisplayName,
  updateSettings: handleUpdateSettings,
  removeSharedList: handleRemoveSharedList,
  approveDeleteRequest: handleApproveDeleteRequest,
  declineDeleteRequest: handleDeclineDeleteRequest,
};

export const LIST_INTENTS: Record<string, ListActionHandler> = {
  create: handleCreateTask,
  toggle: handleToggleTask,
  setCompleted: handleSetCompleted,
  delete: handleDeleteTask,
  clearCompleted: handleClearCompleted,
  updatePriority: handleUpdatePriority,
  updateText: handleUpdateText,
  updateReminder: handleUpdateReminder,
  markReminderSent: handleMarkReminderSent,
  updateRecurrence: handleUpdateRecurrence,
  updateDuration: handleUpdateDuration,
  updateShareMode: handleUpdateShareMode,
  createList: handleCreateList,
  renameList: handleRenameList,
  updateListCategory: handleUpdateListCategory,
  deleteList: handleDeleteList,
};
