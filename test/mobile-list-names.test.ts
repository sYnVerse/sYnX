import { describe, it, expect } from "vitest";
import { getCachedListName } from "../mobile/src/services/listNames";

// Minimal stand-in for React Query's cache: exact-key reads plus prefix-matched query lists.
class FakeQueryClient {
  private data = new Map<string, unknown>();
  setQueryData(key: unknown[], value: unknown) {
    this.data.set(JSON.stringify(key), value);
  }
  getQueryData(key: unknown[]) {
    return this.data.get(JSON.stringify(key)) as any;
  }
  getQueriesData({ queryKey }: { queryKey: unknown[] }) {
    return [...this.data.entries()]
      .map(([k, v]) => [JSON.parse(k), v] as [unknown[], unknown])
      .filter(([k]) => queryKey.every((part, i) => k[i] === part)) as any;
  }
}

describe("getCachedListName", () => {
  it("prefers the single-list query", () => {
    const qc = new FakeQueryClient() as any;
    qc.setQueryData(["list_meta", "a"], { id: "a", name: "Groceries" });
    qc.setQueryData(["lists", "all"], [{ id: "a", name: "Old name" }]);
    expect(getCachedListName(qc, "a")).toBe("Groceries");
  });

  it("falls back to any cached lists query", () => {
    const qc = new FakeQueryClient() as any;
    qc.setQueryData(["lists", "shared"], [{ id: "b", name: "Family" }]);
    expect(getCachedListName(qc, "b")).toBe("Family");
  });

  it("returns null when the list isn't cached or has no id", () => {
    const qc = new FakeQueryClient() as any;
    expect(getCachedListName(qc, "missing")).toBeNull();
    expect(getCachedListName(qc, undefined)).toBeNull();
  });
});
