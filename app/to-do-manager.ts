export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  priority: "low" | "medium" | "high";
  reminderAt?: number;
  reminderSent?: boolean;
  parentId?: string;
  recurrence?: "none" | "daily" | "weekly" | "monthly";
}

export interface UserSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  phoneNumber: string;
  phoneCarrier: string;
  discordWebhookUrl: string;
}

export interface PendingReminder {
  id: string; // todoId
  listId: string;
  userId: string;
  text: string;
  reminderAt: number;
  email?: string;
  phoneNumber?: string;
  phoneCarrier?: string;
  discordWebhookUrl?: string;
}

/**
 * TodoManager handles all interactions with the Todos D1 database.
 * This class provides CRUD operations for managing todo items in SQLite storage.
 */
export class TodoManager {
  /**
   * Creates a new TodoManager instance
   * @param db - The Cloudflare D1 database instance
   * @param listId - The list ID under which todos will be stored
   * @param expirationTtl - Ignored in D1 database (handled by lists table expiration)
   */
  constructor(
    private db: D1Database,
    private listId: string,
    private expirationTtl?: number,
  ) {}

  /**
   * Retrieves all todos from storage
   * @returns Promise containing an array of Todo items, sorted by creation date (newest first)
   */
  async list(): Promise<Todo[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM todos WHERE list_id = ? ORDER BY created_at DESC")
      .bind(this.listId)
      .all<any>();
    return results.map((t) => ({
      id: t.id,
      text: t.text,
      completed: Boolean(t.completed),
      createdAt: Number(t.created_at),
      priority: t.priority as "low" | "medium" | "high",
      reminderAt: t.reminder_at ? Number(t.reminder_at) : undefined,
      reminderSent: t.reminder_sent !== null ? Boolean(t.reminder_sent) : undefined,
      parentId: t.parent_id || undefined,
      recurrence: (t.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
    }));
  }

  /**
   * Creates a new todo item
   * @param text - The text content of the todo item
   * @param priority - The priority level of the todo item (defaults to "medium")
   * @param reminderAt - Optional reminder timestamp (in ms)
   * @param parentId - Optional parent todo ID for subtasks
   * @param recurrence - Optional recurrence setting (defaults to "none")
   * @returns Promise containing the newly created Todo item
   */
  async create(
    text: string,
    priority: "low" | "medium" | "high" = "medium",
    reminderAt?: number,
    parentId?: string,
    recurrence: "none" | "daily" | "weekly" | "monthly" = "none",
  ): Promise<Todo> {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    await this.db
      .prepare(
        "INSERT INTO todos (id, list_id, text, completed, created_at, priority, reminder_at, reminder_sent, parent_id, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        id,
        this.listId,
        text,
        0,
        createdAt,
        priority,
        reminderAt ?? null,
        reminderAt ? 0 : null,
        parentId ?? null,
        recurrence
      )
      .run();
    return {
      id,
      text,
      completed: false,
      createdAt,
      priority,
      reminderAt,
      reminderSent: reminderAt ? false : undefined,
      parentId,
      recurrence,
    };
  }

  /**
   * Toggles the completed status of a todo item
   * @param id - The unique identifier of the todo item to toggle
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async toggle(id: string): Promise<Todo> {
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    const newCompleted = todo.completed ? 0 : 1;
    await this.db.prepare("UPDATE todos SET completed = ? WHERE id = ? AND list_id = ?").bind(newCompleted, id, this.listId).run();
    return {
      id: todo.id,
      text: todo.text,
      completed: Boolean(newCompleted),
      createdAt: Number(todo.created_at),
      priority: todo.priority as "low" | "medium" | "high",
      reminderAt: todo.reminder_at ? Number(todo.reminder_at) : undefined,
      reminderSent: todo.reminder_sent !== null ? Boolean(todo.reminder_sent) : undefined,
      parentId: todo.parent_id || undefined,
      recurrence: (todo.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
    };
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
   * Updates the priority of a todo item
   * @param id - The unique identifier of the todo item to update
   * @param priority - The new priority level
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async updatePriority(id: string, priority: "low" | "medium" | "high"): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET priority = ? WHERE id = ? AND list_id = ?").bind(priority, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return {
      id: todo.id,
      text: todo.text,
      completed: Boolean(todo.completed),
      createdAt: Number(todo.created_at),
      priority: todo.priority as "low" | "medium" | "high",
      reminderAt: todo.reminder_at ? Number(todo.reminder_at) : undefined,
      reminderSent: todo.reminder_sent !== null ? Boolean(todo.reminder_sent) : undefined,
      parentId: todo.parent_id || undefined,
      recurrence: (todo.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
    };
  }

  /**
   * Updates the reminder timestamp of a todo item
   * @param id - The unique identifier of the todo item to update
   * @param reminderAt - The new reminder timestamp (in ms), or undefined to clear
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async updateReminder(id: string, reminderAt?: number): Promise<Todo> {
    await this.db
      .prepare("UPDATE todos SET reminder_at = ?, reminder_sent = ? WHERE id = ? AND list_id = ?")
      .bind(reminderAt ?? null, reminderAt ? 0 : null, id, this.listId)
      .run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return {
      id: todo.id,
      text: todo.text,
      completed: Boolean(todo.completed),
      createdAt: Number(todo.created_at),
      priority: todo.priority as "low" | "medium" | "high",
      reminderAt: todo.reminder_at ? Number(todo.reminder_at) : undefined,
      reminderSent: todo.reminder_sent !== null ? Boolean(todo.reminder_sent) : undefined,
      parentId: todo.parent_id || undefined,
      recurrence: (todo.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
    };
  }

  /**
   * Marks a reminder as sent
   * @param id - The unique identifier of the todo item
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async markReminderSent(id: string): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET reminder_sent = 1 WHERE id = ? AND list_id = ?").bind(id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return {
      id: todo.id,
      text: todo.text,
      completed: Boolean(todo.completed),
      createdAt: Number(todo.created_at),
      priority: todo.priority as "low" | "medium" | "high",
      reminderAt: todo.reminder_at ? Number(todo.reminder_at) : undefined,
      reminderSent: Boolean(todo.reminder_sent),
      parentId: todo.parent_id || undefined,
      recurrence: (todo.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
    };
  }

  /**
   * Updates the recurrence of a todo item
   * @param id - The unique identifier of the todo item
   * @param recurrence - The recurrence setting
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async updateRecurrence(id: string, recurrence: "none" | "daily" | "weekly" | "monthly"): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET recurrence = ? WHERE id = ? AND list_id = ?").bind(recurrence, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return {
      id: todo.id,
      text: todo.text,
      completed: Boolean(todo.completed),
      createdAt: Number(todo.created_at),
      priority: todo.priority as "low" | "medium" | "high",
      reminderAt: todo.reminder_at ? Number(todo.reminder_at) : undefined,
      reminderSent: todo.reminder_sent !== null ? Boolean(todo.reminder_sent) : undefined,
      parentId: todo.parent_id || undefined,
      recurrence: (todo.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
    };
  }

  /**
   * Removes all completed todos from storage
   * @returns Promise that resolves when the operation is complete
   */
  async clearCompleted(): Promise<void> {
    await this.db.prepare("DELETE FROM todos WHERE list_id = ? AND completed = 1").bind(this.listId).run();
  }
}
