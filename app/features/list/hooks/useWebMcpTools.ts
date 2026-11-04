import { useEffect } from "react";
import type { FetcherWithComponents } from "@remix-run/react";
import type { Todo } from "~/to-do-manager";

interface UseWebMcpToolsOptions {
  activeListId?: string;
  todos: Todo[];
  createFetcher: FetcherWithComponents<unknown>;
}

export function useWebMcpTools({
  activeListId,
  todos,
  createFetcher,
}: UseWebMcpToolsOptions) {
  const submitCreate = createFetcher.submit;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = window.navigator as Navigator & {
      modelContext?: {
        registerTool?: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void;
      };
    };
    if (!nav?.modelContext?.registerTool) return;

    const controller = new AbortController();
    const { signal } = controller;

    // Tool: add a new task to the active list
    nav.modelContext.registerTool(
      {
        name: "synx_add_task",
        description: "Add a new task to the user's active sYnX task list.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text of the task to create." },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Priority level of the task. Defaults to medium.",
            },
          },
          required: ["text"],
        },
        execute: async ({ text, priority }: { text: string; priority?: string }) => {
          const form = new FormData();
          form.append("text", text);
          form.append("priority", priority ?? "medium");
          if (activeListId) form.append("listId", activeListId);
          submitCreate(form, { method: "post" });
          return { success: true, task: text };
        },
      },
      { signal }
    );

    // Tool: list all current tasks in the active list
    nav.modelContext.registerTool(
      {
        name: "synx_list_tasks",
        description: "Return the tasks in the user's current active sYnX list.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          return {
            tasks: todos.map((t) => ({
              id: t.id,
              text: t.text,
              completed: t.completed,
              priority: t.priority,
            })),
          };
        },
      },
      { signal }
    );

    return () => controller.abort();
  }, [activeListId, todos, submitCreate]);
}
