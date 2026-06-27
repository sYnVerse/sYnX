# sYnX To-Do List App

![To-Do List Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/923473bc-a285-487c-93db-e0ddea3d3700/public)

Manage your to-do list with [Cloudflare Workers Assets](https://developers.cloudflare.com/workers/static-assets/) + [Remix](https://remix.run/) + [Cloudflare D1 Database](https://developers.cloudflare.com/d1/).

---

## Key Features

*   **Public & Collaborative List Sharing**: Share your task list as Private, View-Only, or Collaborative (Public edit access for team coordination).
*   **Inline Task Editing**: Quickly update tasks inline using the Edit (pencil) button or by double-clicking the task text.
*   **One-Level Nested Subtasks**: Break down tasks into subtask checklists.
*   **Flexible Priority Levels**: Select between Low, Medium, High, or No Priority (none) to organize tasks. Unprioritized tasks rank logically at the bottom during priority sorting.
*   **Recurring Tasks**: Automate repeating chores with Daily, Weekly, and Monthly recurrence periods (automatically updates reminder timestamps).
*   **Search & Sorting Options**: Instantly filter tasks by search term and sort by Priority, Due Date, Alphabetical, or Date Created.
*   **Theme Customizer**: Toggle between Midnight Indigo (default), Emerald Forest, Sunset Rose, and Cyberpunk Neon dark themes.
*   **Confetti Celebration**: Responsive CSS/JS confetti particles celebrate when you clear the last remaining task.
*   **Smart Web Notifications**: Local browser pushes and synced email/SMS/Discord notification integrations for task reminders.

---

## Database Migration Setup

This project uses a Cloudflare D1 SQLite database. Run the following SQL queries on your D1 database to add the required columns:

```sql
-- 1. Add share_mode to lists
ALTER TABLE lists ADD COLUMN share_mode TEXT DEFAULT 'private';

-- 2. Add parent_id to todos
ALTER TABLE todos ADD COLUMN parent_id TEXT REFERENCES todos(id) ON DELETE CASCADE;

-- 3. Add recurrence to todos
ALTER TABLE todos ADD COLUMN recurrence TEXT DEFAULT 'none';
```

### Apply Locally
To run these migrations on your local wrangler dev environment, execute:
```bash
npx wrangler d1 execute synx-db --local --command "ALTER TABLE lists ADD COLUMN share_mode TEXT DEFAULT 'private';"
npx wrangler d1 execute synx-db --local --command "ALTER TABLE todos ADD COLUMN parent_id TEXT REFERENCES todos(id) ON DELETE CASCADE;"
npx wrangler d1 execute synx-db --local --command "ALTER TABLE todos ADD COLUMN recurrence TEXT DEFAULT 'none';"
```

---

## Getting Started

1.  **Install the dependencies**:
    ```bash
    npm install
    ```

2.  **Generate D1 Database and Wrangler bindings types**:
    ```bash
    npm run cf-typegen
    ```

3.  **Run Dev server**:
    ```bash
    npm run dev
    ```

4.  **Run Tests**:
    ```bash
    npm run test -- --run
    ```

5.  **Build production version**:
    ```bash
    npm run build
    ```
