export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  priority: "low" | "medium" | "high" | "none";
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
  private mapRow(t: any): Todo {
    return {
      id: t.id,
      text: t.text,
      completed: Boolean(t.completed),
      createdAt: Number(t.created_at),
      priority: (t.priority || "none") as "low" | "medium" | "high" | "none",
      reminderAt: t.reminder_at ? Number(t.reminder_at) : undefined,
      reminderSent: t.reminder_sent !== null ? Boolean(t.reminder_sent) : undefined,
      parentId: t.parent_id || undefined,
      recurrence: (t.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
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
      .all<any>();
    return results.map((t) => this.mapRow(t));
  }

  /**
   * Creates a new todo item
   * @param text - The text content of the todo item
   * @param priority - The priority level of the todo item (defaults to "none")
   * @param reminderAt - Optional reminder timestamp (in ms)
   * @param parentId - Optional parent todo ID for subtasks
   * @param recurrence - Optional recurrence setting (defaults to "none")
   * @returns Promise containing the newly created Todo item
   */
  async create(
    text: string,
    priority: "low" | "medium" | "high" | "none" = "none",
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
        priority === "none" ? null : priority,
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

    const willBeCompleted = !todo.completed;
    if (willBeCompleted && todo.recurrence && todo.recurrence !== "none") {
      const currentReminder = todo.reminder_at ? Number(todo.reminder_at) : Date.now();
      let nextReminder = currentReminder;
      const oneDay = 24 * 60 * 60 * 1000;
      if (todo.recurrence === "daily") {
        nextReminder = currentReminder + oneDay;
      } else if (todo.recurrence === "weekly") {
        nextReminder = currentReminder + 7 * oneDay;
      } else if (todo.recurrence === "monthly") {
        const date = new Date(currentReminder);
        date.setMonth(date.getMonth() + 1);
        nextReminder = date.getTime();
      }

      await this.db
        .prepare("UPDATE todos SET reminder_at = ?, reminder_sent = 0, completed = 0 WHERE id = ? AND list_id = ?")
        .bind(nextReminder, id, this.listId)
        .run();
    } else {
      const newCompleted = willBeCompleted ? 1 : 0;
      await this.db
        .prepare("UPDATE todos SET completed = ? WHERE id = ? AND list_id = ?")
        .bind(newCompleted, id, this.listId)
        .run();
    }

    const updated = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    return this.mapRow(updated);
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
  async updatePriority(id: string, priority: "low" | "medium" | "high" | "none"): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET priority = ? WHERE id = ? AND list_id = ?").bind(priority === "none" ? null : priority, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the text of a todo item
   * @param id - The unique identifier of the todo item to update
   * @param text - The new text content
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async updateText(id: string, text: string): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET text = ? WHERE id = ? AND list_id = ?").bind(text, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
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
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<any>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
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
