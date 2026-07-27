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
  subtasks?: TodoItem[];
}

// List data structure
export interface TodoList {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  expirationTtl?: number | null;
  shareMode: ShareMode;
}

// User settings data structure
export interface UserSettings {
  userId: string;
  email?: string;
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
  reminderAt: v.optional(v.number()),
  parentId: v.optional(v.string()),
  recurrence: v.optional(RecurrencePatternSchema, "none"),
});

export type CreateTodoInput = v.InferOutput<typeof CreateTodoSchema>;

export const UpdateTodoSchema = v.object({
  text: v.optional(v.pipe(v.string(), v.minLength(1))),
  priority: v.optional(PriorityLevelSchema),
  reminderAt: v.optional(v.nullable(v.number())),
  recurrence: v.optional(RecurrencePatternSchema),
});

export type UpdateTodoInput = v.InferOutput<typeof UpdateTodoSchema>;

export const CreateListSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, "List name cannot be empty")),
});

export type CreateListInput = v.InferOutput<typeof CreateListSchema>;

export const UpdateShareModeSchema = v.object({
  shareMode: ShareModeSchema,
});

export type UpdateShareModeInput = v.InferOutput<typeof UpdateShareModeSchema>;

export const RegisterDeviceTokenSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1, "Push token is required")),
  platform: v.pipe(v.string(), v.minLength(1, "Platform is required")),
});

export type RegisterDeviceTokenInput = v.InferOutput<typeof RegisterDeviceTokenSchema>;
