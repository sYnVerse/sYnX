import * as v from "valibot";

// Share mode enum definition
export type ShareMode = "private" | "public_read" | "public_edit";

export const ShareModeSchema = v.picklist(["private", "public_read", "public_edit"]);

// Priority enum definition
export type PriorityLevel = "low" | "medium" | "high" | "none";

export const PriorityLevelSchema = v.picklist(["low", "medium", "high", "none"]);

// Recurrence enum definition
export type RecurrencePattern = "none" | "daily" | "weekly" | "monthly";

export const RecurrencePatternSchema = v.picklist(["none", "daily", "weekly", "monthly"]);

// Todo item data structure
export interface TodoItem {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  createdAt: number;
  priority: PriorityLevel;
  reminderAt?: number;
  reminderSent: boolean;
  parentId?: string | null;
  recurrence: RecurrencePattern;
  durationMinutes?: number | null;
  subtasks?: TodoItem[];
}

/** Public owner summary on list payloads — display name only (never email). */
export interface ListOwner {
  displayName: string;
}

export type ListScope = "mine" | "shared" | "all";

// List data structure
export interface TodoList {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  expirationTtl?: number | null;
  shareMode: ShareMode;
  category?: string;
  isOwner?: boolean;
  canEdit?: boolean;
  /** Additive: present on newer API responses */
  owner?: ListOwner;
}

// User settings data structure
export interface UserSettings {
  userId: string;
  email?: string;
  /** Resolved display name (default "sYnX user" when unset) */
  displayName?: string;
  displayNameSet?: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  phoneNumber: string;
  phoneCarrier: string;
  discordWebhookUrl: string;
}

// API Schemas & Request Payloads
export const CreateTodoSchema = v.object({
  text: v.pipe(v.string(), v.minLength(1, "Text cannot be empty")),
  listId: v.pipe(v.string(), v.minLength(1, "List ID is required")),
  priority: v.optional(PriorityLevelSchema, "none"),
  reminderAt: v.optional(v.nullable(v.number())),
  parentId: v.optional(v.string()),
  recurrence: v.optional(RecurrencePatternSchema, "none"),
  durationMinutes: v.optional(v.nullable(v.number())),
});

export type CreateTodoInput = v.InferOutput<typeof CreateTodoSchema>;

export const UpdateTodoSchema = v.object({
  text: v.optional(v.pipe(v.string(), v.minLength(1))),
  priority: v.optional(PriorityLevelSchema),
  reminderAt: v.optional(v.nullable(v.number())),
  recurrence: v.optional(RecurrencePatternSchema),
  durationMinutes: v.optional(v.nullable(v.number())),
});

export type UpdateTodoInput = v.InferOutput<typeof UpdateTodoSchema>;

/** Explicit done-state payload for POST /api/v1/todos/:id/completed */
export const SetTodoCompletedSchema = v.object({
  completed: v.boolean(),
});

export type SetTodoCompletedInput = v.InferOutput<typeof SetTodoCompletedSchema>;

export const CreateListSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, "List name cannot be empty")),
  category: v.optional(v.string(), "Checklist"),
});

export type CreateListInput = v.InferOutput<typeof CreateListSchema>;

export const UpdateListSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1))),
  category: v.optional(v.string()),
});

export type UpdateListInput = v.InferOutput<typeof UpdateListSchema>;

export const UpdateShareModeSchema = v.object({
  shareMode: ShareModeSchema,
});

export type UpdateShareModeInput = v.InferOutput<typeof UpdateShareModeSchema>;

export const RegisterDeviceTokenSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1, "Push token is required")),
  platform: v.pipe(v.string(), v.minLength(1, "Platform is required")),
});

export type RegisterDeviceTokenInput = v.InferOutput<typeof RegisterDeviceTokenSchema>;

export * from "./changelog";

export * from "./deep-link";

export * from "./list-permissions";

export * from "./mobile-ux";

export * from "./mobile-version";

export * from "./reminder-time";

export * from "./time-zone";

export * from "./todo-completed";

export * from "./widget-snapshot";
