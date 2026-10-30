import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CreateTodoSchema, UpdateTodoSchema, CreateListSchema, UpdateListSchema } from "../shared";

describe("API Schemas & Category Validation", () => {
  describe("CreateTodoSchema", () => {
    it("allows payload without durationMinutes (defaults to undefined)", () => {
      const input = {
        text: "Buy groceries",
        listId: "list-123",
      };
      const result = v.parse(CreateTodoSchema, input);
      expect(result.durationMinutes).toBeUndefined();
    });

    it("allows explicit null for durationMinutes", () => {
      const input = {
        text: "Buy groceries",
        listId: "list-123",
        durationMinutes: null,
      };
      const result = v.parse(CreateTodoSchema, input);
      expect(result.durationMinutes).toBeNull();
    });

    it("parses valid numeric durationMinutes", () => {
      const input = {
        text: "Study for exam",
        listId: "list-123",
        durationMinutes: 45,
      };
      const result = v.parse(CreateTodoSchema, input);
      expect(result.durationMinutes).toBe(45);
    });
  });

  describe("UpdateTodoSchema", () => {
    it("allows durationMinutes to be updated to a number or set to null", () => {
      const updateNumber = v.parse(UpdateTodoSchema, { durationMinutes: 60 });
      expect(updateNumber.durationMinutes).toBe(60);

      const updateNull = v.parse(UpdateTodoSchema, { durationMinutes: null });
      expect(updateNull.durationMinutes).toBeNull();
    });
  });

  describe("CreateListSchema & UpdateListSchema", () => {
    it("allows preset categories and custom category tags", () => {
      const presetList = v.parse(CreateListSchema, { name: "Work Tasks", category: "Work" });
      expect(presetList.category).toBe("Work");

      const customList = v.parse(CreateListSchema, { name: "Secret Project", category: "🚀 Top Secret" });
      expect(customList.category).toBe("🚀 Top Secret");
    });

    it("allows updating list category to custom text", () => {
      const updated = v.parse(UpdateListSchema, { category: "🎨 Design Work" });
      expect(updated.category).toBe("🎨 Design Work");
    });
  });
});
