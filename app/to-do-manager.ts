export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  priority: "low" | "medium" | "high";
  reminderAt?: number;
  reminderSent?: boolean;
}

/**
 * TodoManager handles all interactions with the Todos KV store.
 * This class provides CRUD operations for managing todo items in Cloudflare KV storage.
 *
 * By separating all of the logic for interacting with the KV store from the
 * rest of the Remix application, we can easily test the logic in isolation
 * using [Cloudflare's vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
 */
export class TodoManager {
  /**
   * Creates a new TodoManager instance
   * @param kv - The Cloudflare KV namespace instance to use for storage
   * @param todosKey - The key under which todos will be stored in KV (defaults to "todos")
   */
  constructor(
    private kv: KVNamespace,
    private todosKey: string = "todos",
    private expirationTtl?: number,
  ) {}

  /**
   * Retrieves all todos from storage
   * @returns Promise containing an array of Todo items, sorted by creation date (newest first)
   */
  async list(): Promise<Todo[]> {
    const todos = await this.kv.get(this.todosKey, "json");
    if (Array.isArray(todos)) {
      todos.sort((a: Todo, b: Todo) => b.createdAt - a.createdAt);
    }
    return (todos || []) as Todo[];
  }

  /**
   * Creates a new todo item
   * @param text - The text content of the todo item
   * @param priority - The priority level of the todo item (defaults to "medium")
   * @returns Promise containing the newly created Todo item
   */
  async create(
    text: string,
    priority: "low" | "medium" | "high" = "medium",
    reminderAt?: number,
  ): Promise<Todo> {
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: Date.now(),
      priority,
      reminderAt,
      reminderSent: reminderAt ? false : undefined,
    };
    const todos = await this.list();
    todos.push(newTodo);
    const options = this.expirationTtl ? { expirationTtl: this.expirationTtl } : {};
    await this.kv.put(this.todosKey, JSON.stringify(todos), options);
    return newTodo;
  }

  /**
   * Toggles the completed status of a todo item
   * @param id - The unique identifier of the todo item to toggle
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async toggle(id: string): Promise<Todo> {
    const todos = await this.list();
    const todoIndex = todos.findIndex((todo) => todo.id === id);
    if (todoIndex === -1) {
      throw new Error(`Todo with id ${id} not found`);
    }
    todos[todoIndex].completed = !todos[todoIndex].completed;
    const options = this.expirationTtl ? { expirationTtl: this.expirationTtl } : {};
    await this.kv.put(this.todosKey, JSON.stringify(todos), options);
    return todos[todoIndex];
  }

  /**
   * Deletes a todo item
   * @param id - The unique identifier of the todo item to delete
   * @returns Promise that resolves when the deletion is complete
   */
  async delete(id: string): Promise<void> {
    const todos = await this.list();
    const newTodos = todos.filter((todo) => todo.id !== id);
    const options = this.expirationTtl ? { expirationTtl: this.expirationTtl } : {};
    await this.kv.put(this.todosKey, JSON.stringify(newTodos), options);
  }

  /**
   * Updates the priority of a todo item
   * @param id - The unique identifier of the todo item to update
   * @param priority - The new priority level
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async updatePriority(id: string, priority: "low" | "medium" | "high"): Promise<Todo> {
    const todos = await this.list();
    const todoIndex = todos.findIndex((todo) => todo.id === id);
    if (todoIndex === -1) {
      throw new Error(`Todo with id ${id} not found`);
    }
    todos[todoIndex].priority = priority;
    const options = this.expirationTtl ? { expirationTtl: this.expirationTtl } : {};
    await this.kv.put(this.todosKey, JSON.stringify(todos), options);
    return todos[todoIndex];
  }

  /**
   * Updates the reminder timestamp of a todo item
   * @param id - The unique identifier of the todo item to update
   * @param reminderAt - The new reminder timestamp (in ms), or undefined to clear
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async updateReminder(id: string, reminderAt?: number): Promise<Todo> {
    const todos = await this.list();
    const todoIndex = todos.findIndex((todo) => todo.id === id);
    if (todoIndex === -1) {
      throw new Error(`Todo with id ${id} not found`);
    }
    todos[todoIndex].reminderAt = reminderAt;
    todos[todoIndex].reminderSent = reminderAt ? false : undefined;
    const options = this.expirationTtl ? { expirationTtl: this.expirationTtl } : {};
    await this.kv.put(this.todosKey, JSON.stringify(todos), options);
    return todos[todoIndex];
  }

  /**
   * Marks a reminder as sent
   * @param id - The unique identifier of the todo item
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async markReminderSent(id: string): Promise<Todo> {
    const todos = await this.list();
    const todoIndex = todos.findIndex((todo) => todo.id === id);
    if (todoIndex === -1) {
      throw new Error(`Todo with id ${id} not found`);
    }
    todos[todoIndex].reminderSent = true;
    const options = this.expirationTtl ? { expirationTtl: this.expirationTtl } : {};
    await this.kv.put(this.todosKey, JSON.stringify(todos), options);
    return todos[todoIndex];
  }

  /**
   * Removes all completed todos from storage
   * @returns Promise that resolves when the operation is complete
   */
  async clearCompleted(): Promise<void> {
    const todos = await this.list();
    const activeTodos = todos.filter((todo) => !todo.completed);
    const options = this.expirationTtl ? { expirationTtl: this.expirationTtl } : {};
    await this.kv.put(this.todosKey, JSON.stringify(activeTodos), options);
  }
}

export interface UserSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  phoneNumber: string;
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
  discordWebhookUrl?: string;
}

export class PendingRemindersManager {
  constructor(private kv: KVNamespace) {}

  async list(): Promise<PendingReminder[]> {
    const list = await this.kv.get("reminders:pending", "json");
    return (list || []) as PendingReminder[];
  }

  async syncReminder(
    todoId: string,
    listId: string,
    userId: string,
    text: string,
    reminderAt: number,
    userEmail?: string
  ): Promise<void> {
    const queue = await this.list();
    
    // Fetch user settings
    const settings = await this.kv.get(`user:${userId}:settings`, "json") as UserSettings | null;
    const isGuest = userId.startsWith("guest_");
    const emailEnabled = !isGuest && (settings?.emailEnabled ?? false);
    const smsEnabled = !isGuest && (settings?.smsEnabled ?? false);
    const phoneNumber = settings?.phoneNumber || "";
    const discordWebhookUrl = settings?.discordWebhookUrl || "";

    const newReminder: PendingReminder = {
      id: todoId,
      listId,
      userId,
      text,
      reminderAt,
    };

    if (emailEnabled && userEmail) {
      newReminder.email = userEmail;
    }
    if (smsEnabled && phoneNumber) {
      newReminder.phoneNumber = phoneNumber;
    }
    if (discordWebhookUrl) {
      newReminder.discordWebhookUrl = discordWebhookUrl;
    }

    // Filter out existing and add new
    const filtered = queue.filter(r => r.id !== todoId);
    filtered.push(newReminder);
    filtered.sort((a, b) => a.reminderAt - b.reminderAt);

    await this.kv.put("reminders:pending", JSON.stringify(filtered));
  }

  async removeReminder(todoId: string): Promise<void> {
    const queue = await this.list();
    const filtered = queue.filter(r => r.id !== todoId);
    await this.kv.put("reminders:pending", JSON.stringify(filtered));
  }
}
