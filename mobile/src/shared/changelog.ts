export type ChangelogCategory = "NEW" | "IMPR" | "FIX";

export interface ChangelogItem {
  type: ChangelogCategory;
  text: string;
}

export interface ReleaseNote {
  version: string;
  date?: string;
  title?: string;
  changes: ChangelogItem[];
}
