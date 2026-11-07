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
    it("allows preset categories, custom category tags, and optional/null category (#139)", () => {
      const presetList = v.parse(CreateListSchema, { name: "Work Tasks", category: "Work" });
      expect(presetList.category).toBe("Work");

      const customList = v.parse(CreateListSchema, { name: "Secret Project", category: "🚀 Top Secret" });
      expect(customList.category).toBe("🚀 Top Secret");

      const uncategorizedList = v.parse(CreateListSchema, { name: "No Tag List" });
      expect(uncategorizedList.category).toBeUndefined();

      const nullCategoryList = v.parse(CreateListSchema, { name: "Explicit Null", category: null });
      expect(nullCategoryList.category).toBeNull();
    });

    it("allows updating list category to custom text, null, or empty string to clear (#139)", () => {
      const updated = v.parse(UpdateListSchema, { category: "🎨 Design Work" });
      expect(updated.category).toBe("🎨 Design Work");

      const clearedNull = v.parse(UpdateListSchema, { category: null });
      expect(clearedNull.category).toBeNull();

      const clearedEmpty = v.parse(UpdateListSchema, { category: "" });
      expect(clearedEmpty.category).toBe("");

      const untouched = v.parse(UpdateListSchema, { name: "Renamed Only" });
      expect(untouched.category).toBeUndefined();
    });
  });
});
