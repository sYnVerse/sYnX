import { nextReminderAt } from "../shared";

export interface Todo {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  createdAt: number;
  priority: "low" | "medium" | "high" | "none";
  reminderAt?: number;
  reminderSent?: boolean;
  /** Signed-in user ID who created/set the reminder (falls back to list owner when omitted). */
  reminderUserId?: string;
  parentId?: string;
  recurrence?: "none" | "daily" | "weekly" | "monthly";
  durationMinutes?: number;
  /** Collaborator delete request awaiting owner approval. */
  pendingDelete?: boolean;
  rescheduled?: boolean;
}

export interface TodoRow {
  id: string;
  list_id: string;
  text: string;
  completed: number | boolean;
  created_at: number;
  priority: string | null;
  reminder_at: number | null;
  reminder_sent: number | boolean | null;
  reminder_user_id?: string | null;
  parent_id: string | null;
  recurrence: string | null;
  duration_minutes: number | null;
}

export interface UserSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  phoneNumber: string;
  phoneCarrier: string;
  discordWebhookUrl: string;
}

export interface PendingReminder {
  id: string;
  listId: string;
  listName?: string;
  text: string;
  reminderAt: number;
  userId: string;
  email?: string;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  phoneNumber?: string;
  phoneCarrier?: string;
  discordWebhookUrl?: string;
}

export class TodoManager {
  private db: D1Database;
  private listId: string;
  private expirationTtl?: number;

  constructor(db: D1Database, listId: string, expirationTtl?: number) {
    this.db = db;
    this.listId = listId;
    this.expirationTtl = expirationTtl;
  }

  /**
   * Helper to map DB row to Todo object
   */
  private mapRow(t: TodoRow): Todo {
    return {
      id: t.id,
      listId: t.list_id || this.listId,
      text: t.text,
      completed: Boolean(t.completed),
      createdAt: Number(t.created_at),
      priority: (t.priority || "none") as "low" | "medium" | "high" | "none",
      reminderAt: t.reminder_at ? Number(t.reminder_at) : undefined,
      reminderSent: t.reminder_sent !== null ? Boolean(t.reminder_sent) : undefined,
      reminderUserId: t.reminder_user_id || undefined,
      parentId: t.parent_id || undefined,
      recurrence: (t.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
      durationMinutes: t.duration_minutes !== null && t.duration_minutes !== undefined ? Number(t.duration_minutes) : undefined,
    };
  }

  /**
   * Retrieves all todos from storage
   * @returns Promise containing an array of Todo items, sorted by creation date (newest first)
   */
  async list(): Promise<Todo[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM todos WHERE list_id = ? ORDER BY created_at DESC")
      .bind(this.listId)
      .all<TodoRow>();
    return results.map((t) => this.mapRow(t));
  }

  /**
   * Creates a new todo item
   * @param text - The text content of the todo item
   * @param priority - The priority level of the todo item (defaults to "none")
   * @param reminderAt - Optional reminder timestamp (in ms)
   * @param parentId - Optional parent todo ID for subtasks
   * @param recurrence - Optional recurrence setting (defaults to "none")
   * @param durationMinutes - Optional estimated duration in minutes (defaults to null)
   * @param reminderUserId - Optional user ID who owns the reminder notification
   * @returns Promise containing the newly created Todo item
   */
  async create(
    text: string,
    priority: "low" | "medium" | "high" | "none" = "none",
    reminderAt?: number | null,
    parentId?: string,
    recurrence: "none" | "daily" | "weekly" | "monthly" = "none",
    durationMinutes: number | null = null,
    reminderUserId?: string | null,
  ): Promise<Todo> {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const effectiveReminderUserId = reminderAt ? (reminderUserId ?? null) : null;
    await this.db
      .prepare(
        "INSERT INTO todos (id, list_id, text, completed, created_at, priority, reminder_at, reminder_sent, reminder_user_id, parent_id, recurrence, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        id,
        this.listId,
        text,
        0,
        createdAt,
        priority === "none" ? null : priority,
        reminderAt ?? null,
        reminderAt ? 0 : null,
        effectiveReminderUserId,
        parentId ?? null,
        recurrence,
        durationMinutes
      )
      .run();
    return {
      id,
      listId: this.listId,
      text,
      completed: false,
      createdAt,
      priority,
      reminderAt: reminderAt || undefined,
      reminderSent: reminderAt ? false : undefined,
      reminderUserId: effectiveReminderUserId || undefined,
      parentId,
      recurrence,
      durationMinutes: durationMinutes !== null && durationMinutes !== undefined ? durationMinutes : undefined,
    };
  }

  /**
   * Sets the completed status of a todo to an explicit value (idempotent).
   * Recurring tasks marked done advance the reminder and stay uncompleted.
   * Pass the user's IANA `timeZone` so repeats keep their local clock time
   * across daylight saving changes; without it they advance a fixed 24h / 7d.
   */
  async setCompleted(
    id: string,
    completed: boolean,
    options: { timeZone?: string } = {}
  ): Promise<{ todo: Todo; rescheduled: boolean }> {
    const todo = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }

    const currentlyCompleted = Boolean(todo.completed);
    const recurrence = todo.recurrence as string | undefined;
    const isRecurring = Boolean(recurrence && recurrence !== "none");

    if (completed && isRecurring) {
      const currentReminder = todo.reminder_at ? Number(todo.reminder_at) : Date.now();
      const nextReminder = nextReminderAt(currentReminder, String(recurrence), options.timeZone);

      await this.db
        .prepare("UPDATE todos SET reminder_at = ?, reminder_sent = 0, completed = 0 WHERE id = ? AND list_id = ?")
        .bind(nextReminder, id, this.listId)
        .run();

      const updated = await this.db
        .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
        .bind(id, this.listId)
        .first<TodoRow>();
      if (!updated) {
        throw new Error(`Todo with id ${id} not found in this list`);
      }
      return { todo: this.mapRow(updated), rescheduled: true };
    }

    if (currentlyCompleted === Boolean(completed)) {
      return { todo: this.mapRow(todo), rescheduled: false };
    }

    await this.db
      .prepare("UPDATE todos SET completed = ? WHERE id = ? AND list_id = ?")
      .bind(completed ? 1 : 0, id, this.listId)
      .run();

    const updated = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!updated) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return { todo: this.mapRow(updated), rescheduled: false };
  }

  /**
   * Toggles the completed status of a todo item (legacy flip).
   * Prefer setCompleted for idempotent clients.
   */
  async toggle(id: string, options: { timeZone?: string } = {}): Promise<Todo & { rescheduled: boolean }> {
    const todo = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    const result = await this.setCompleted(id, !todo.completed, options);
    return { ...result.todo, rescheduled: result.rescheduled };
  }

  /**
   * Deletes a todo item
   * @param id - The unique identifier of the todo item to delete
   * @returns Promise that resolves when the deletion is complete
   */
  async delete(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).run();
  }

  /**
   * Updates the text of a todo item
   * @param id - The unique identifier of the todo item
   * @param text - The new text content
   * @returns Promise containing the updated Todo item
   */
  async updateText(id: string, text: string): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET text = ? WHERE id = ? AND list_id = ?").bind(text, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the priority level of a todo item
   * @param id - The unique identifier of the todo item
   * @param priority - The new priority level
   * @returns Promise containing the updated Todo item
   */
  async updatePriority(id: string, priority: "low" | "medium" | "high" | "none"): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET priority = ? WHERE id = ? AND list_id = ?").bind(priority, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the reminder timestamp of a todo item
   * @param id - The unique identifier of the todo item
   * @param reminderAt - The new reminder timestamp (in ms) or undefined to clear
   * @param reminderUserId - Optional user ID who owns the reminder notification
   * @returns Promise containing the updated Todo item
   */
  async updateReminder(id: string, reminderAt?: number, reminderUserId?: string | null): Promise<Todo> {
    const val = reminderAt !== undefined ? reminderAt : null;
    const ownerVal = reminderAt !== undefined ? (reminderUserId ?? null) : null;
    await this.db
      .prepare("UPDATE todos SET reminder_at = ?, reminder_sent = ?, reminder_user_id = ? WHERE id = ? AND list_id = ?")
      .bind(val, reminderAt !== undefined ? 0 : null, ownerVal, id, this.listId)
      .run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Marks a reminder as sent
   * @param id - The unique identifier of the todo item
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async markReminderSent(id: string): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET reminder_sent = 1 WHERE id = ? AND list_id = ?").bind(id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the recurrence setting of a todo item
   * @param id - The unique identifier of the todo item
   * @param recurrence - The new recurrence setting
   * @returns Promise containing the updated Todo item
   */
  async updateRecurrence(id: string, recurrence: "none" | "daily" | "weekly" | "monthly"): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET recurrence = ? WHERE id = ? AND list_id = ?").bind(recurrence, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the duration (in minutes) of a todo item
   * @param id - The unique identifier of the todo item
   * @param durationMinutes - The duration in minutes or null to clear
   * @returns Promise containing the updated Todo item
   */
  async updateDuration(id: string, durationMinutes: number | null): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET duration_minutes = ? WHERE id = ? AND list_id = ?").bind(durationMinutes, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Removes all completed todos from storage
   * @returns Promise that resolves when the operation is complete
   */
  async clearCompleted(): Promise<void> {
    await this.db.prepare("DELETE FROM todos WHERE list_id = ? AND completed = 1").bind(this.listId).run();
  }
}
