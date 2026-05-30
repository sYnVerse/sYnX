import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { TodoManager } from "../app/to-do-manager";
import { env } from "cloudflare:test";

describe("TodoManager", () => {
  let kv: KVNamespace;
  let manager: TodoManager;

  beforeEach(() => {
    kv = env.TO_DO_LIST;
    manager = new TodoManager(kv);
  });

  afterEach(async () => {
    await kv.delete("todos");
  });

  describe("list()", () => {
    it("returns empty array when no todos exist", async () => {
      const todos = await manager.list();
      expect(todos).toEqual([]);
    });

    it("returns todos sorted by createdAt desc", async () => {
      const todo1 = await manager.create("First");
      const todo2 = await manager.create("Second");

      const todos = await manager.list();
      expect(todos).toHaveLength(2);
      expect(todos).toEqual(expect.arrayContaining([todo2, todo1]));
    });
  });

  describe("create()", () => {
    it("creates a new todo", async () => {
      const todo = await manager.create("Test todo");

      expect(todo).toMatchObject({
        text: "Test todo",
        completed: false,
      });
      expect(todo.id).toBeDefined();
      expect(todo.createdAt).toBeTypeOf("number");
      expect(todo.priority).toBe("medium");

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([todo]);
    });

    it("creates a todo with custom priority", async () => {
      const todo = await manager.create("High priority todo", "high");

      expect(todo).toMatchObject({
        text: "High priority todo",
        completed: false,
        priority: "high",
      });
      expect(todo.id).toBeDefined();
      expect(todo.createdAt).toBeTypeOf("number");

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([todo]);
    });

    it("creates a todo with custom reminderAt", async () => {
      const reminderTime = Date.now() + 60000;
      const todo = await manager.create("Reminder todo", "medium", reminderTime);

      expect(todo).toMatchObject({
        text: "Reminder todo",
        completed: false,
        priority: "medium",
        reminderAt: reminderTime,
        reminderSent: false,
      });

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([todo]);
    });
  });

  describe("toggle()", () => {
    it("toggles todo completion status", async () => {
      const todo = await manager.create("Test todo");
      expect(todo.completed).toBe(false);

      const toggled = await manager.toggle(todo.id);
      expect(toggled.completed).toBe(true);

      const storedTodos = await manager.list();
      expect(storedTodos[0].completed).toBe(true);
    });
  });

  describe("delete()", () => {
    it("deletes a todo", async () => {
      const todo = await manager.create("Test todo");
      await manager.delete(todo.id);

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([]);
    });

    it("deletes a todo when there are multiple todos", async () => {
      const todo1 = await manager.create("Test todo 1");
      const todo2 = await manager.create("Test todo 2");
      await manager.delete(todo1.id);

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([todo2]);
    });
  });

  describe("updatePriority()", () => {
    it("updates the priority of a todo", async () => {
      const todo = await manager.create("Test todo");
      expect(todo.priority).toBe("medium");

      const updated = await manager.updatePriority(todo.id, "high");
      expect(updated.priority).toBe("high");

      const storedTodos = await manager.list();
      expect(storedTodos[0].priority).toBe("high");
    });
  });

  describe("updateReminder()", () => {
    it("updates the reminder of a todo", async () => {
      const todo = await manager.create("Test todo");
      expect(todo.reminderAt).toBeUndefined();

      const reminderTime = Date.now() + 120000;
      const updated = await manager.updateReminder(todo.id, reminderTime);
      expect(updated.reminderAt).toBe(reminderTime);
      expect(updated.reminderSent).toBe(false);

      const storedTodos = await manager.list();
      expect(storedTodos[0].reminderAt).toBe(reminderTime);
      expect(storedTodos[0].reminderSent).toBe(false);
    });

    it("clears the reminder of a todo", async () => {
      const reminderTime = Date.now() + 120000;
      const todo = await manager.create("Test todo", "medium", reminderTime);
      expect(todo.reminderAt).toBe(reminderTime);

      const updated = await manager.updateReminder(todo.id, undefined);
      expect(updated.reminderAt).toBeUndefined();
      expect(updated.reminderSent).toBeUndefined();

      const storedTodos = await manager.list();
      expect(storedTodos[0].reminderAt).toBeUndefined();
      expect(storedTodos[0].reminderSent).toBeUndefined();
    });
  });

  describe("markReminderSent()", () => {
    it("marks the reminder of a todo as sent", async () => {
      const reminderTime = Date.now() + 120000;
      const todo = await manager.create("Test todo", "medium", reminderTime);
      expect(todo.reminderSent).toBe(false);

      const updated = await manager.markReminderSent(todo.id);
      expect(updated.reminderSent).toBe(true);

      const storedTodos = await manager.list();
      expect(storedTodos[0].reminderSent).toBe(true);
    });
  });

  describe("clearCompleted()", () => {
    it("removes all completed todos", async () => {
      const todo1 = await manager.create("Active todo");
      const todo2 = await manager.create("Completed todo");
      await manager.toggle(todo2.id);

      await manager.clearCompleted();

      const storedTodos = await manager.list();
      expect(storedTodos).toHaveLength(1);
      expect(storedTodos[0].id).toBe(todo1.id);
    });
  });

  describe("expirationTtl", () => {
    it("can be instantiated with an expiration TTL", async () => {
      const expiringManager = new TodoManager(kv, "expiring_todos", 86400);
      const todo = await expiringManager.create("Expiring task");
      expect(todo.text).toBe("Expiring task");

      const stored = await expiringManager.list();
      expect(stored).toHaveLength(1);
    });
  });
});
