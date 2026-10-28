# sYnX To-Do List App

![To-Do List Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/923473bc-a285-487c-93db-e0ddea3d3700/public)

Manage your task workspaces with [Cloudflare Workers Assets](https://developers.cloudflare.com/workers/static-assets/) + [Remix](https://remix.run/) + [Cloudflare D1 Database](https://developers.cloudflare.com/d1/) on Web, Desktop, and Mobile (React Native / Expo).

---

## Key Features

* **Public & Collaborative List Sharing**: Share your task list as Private, View-Only, or Collaborative (Public edit access for team coordination).
* **Categorized Task Workspaces & Custom Categories**: Organize lists with preset categories (`Checklist`, `Study`, `Shopping`, `Movies`, `Work`, `Personal`, `Travel`, `Fitness`) or create **Custom** category tags on web and mobile.
* **Optional Task Duration**: Set optional task duration estimations (`5m`, `15m`, `30m`, `45m`, `60m`, or custom) via an intuitive Duration picker button. Tasks default to no duration set (`NULL`).
* **Nested Subtask Hierarchy**: Break down main tasks into subtask checklists with clean visual nesting on both Web/Desktop and Mobile list views.
* **Inline Task & Title Editing**: Quickly update tasks and list titles inline using edit buttons or text interaction.
* **Flexible Priority Levels**: Select between Low, Medium, High, or No Priority (none) with high-contrast, accessible dropdown controls.
* **Recurring Tasks**: Automate repeating chores with Daily, Weekly, and Monthly recurrence periods (automatically updates reminder timestamps).
* **Search & Sorting Options**: Filter tasks by search term and sort by Priority, Due Date, Alphabetical, or Date Created.
* **Cross-Platform Mobile App (Expo / React Native)**: Complete mobile client supporting haptic feedback, task creation, sub-task nesting, list switching, and settings.
* **Theme Customizer**: Toggle between Midnight Indigo (default), Emerald Forest, Sunset Rose, and Cyberpunk Neon dark themes.
* **Confetti Celebration**: Responsive CSS/JS confetti particles celebrate when you clear the last remaining task.
* **Smart Web & Push Notifications**: Local browser push alerts, Firebase Cloud Messaging (FCM) mobile notifications, and synced email/SMS/Discord notification integrations.

---

## Database Schema & Migrations

The app stores its data in a Cloudflare D1 (SQLite) database named `synx-db`. The schema lives in numbered SQL files in [`migrations/`](migrations/), and Wrangler records which ones have run in a `d1_migrations` table inside the database. `migrations/0000_baseline.sql` is the full schema as it existed in production on Oct 27, 2026.

### Change the schema

1. Create a new numbered migration file and write the SQL in it:
   ```bash
   npx wrangler d1 migrations create synx-db <short_name>
   ```
2. Apply it to your local dev database:
   ```bash
   npx wrangler d1 migrations apply synx-db --local
   ```
3. Run the tests. They build their database from `migrations/`, so they pick up the change automatically.

Rules:

* Never edit a migration that has already been applied. Fix mistakes with a new migration.
* Keep changes additive within a release (expand, then contract): add the new column or table first, ship code that uses it, and only drop the old one in a later release.
* Don't run DDL (`CREATE`/`ALTER`/`DROP`) from app code for new changes. Some older code still adds columns at runtime (`ensureUserProfileSchema`, `ensureCategoryColumn`); that is legacy and will be removed in a follow-up.

### Production

Production migrations run in the deploy pipeline, not by hand. `npm run deploy` (what Cloudflare Workers Builds runs on every push to `main`) builds the app, applies any pending migrations to the remote database, then deploys the Worker. If a migration fails, the deploy stops before the new code goes live. To see which migrations production has applied (read-only):

```bash
npx wrangler d1 migrations list synx-db --remote
```

---

## Getting Started

1. **Install Web/Remix Dependencies**:
   ```bash
   npm install
   ```

2. **Generate D1 Database and Wrangler Bindings Types**:
   ```bash
   npm run cf-typegen
   ```

3. **Create the Local Database** (builds the schema from `migrations/`):
   ```bash
   npx wrangler d1 migrations apply synx-db --local
   ```

4. **Run Dev Server**:
   ```bash
   npm run dev
   ```

5. **Run Tests**:
   ```bash
   npm run test -- --run
   ```

6. **Run Mobile App (React Native / Expo)**:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```

7. **Build Web Production Bundle**:
   ```bash
   npm run build
   ```

---

## Software Versioning & Breaking Change Rules

### 1. Semantic Versioning (SemVer) Format
Format: **MAJOR.MINOR.PATCH**
* **MAJOR**: Bumps for incompatible API changes (breaking changes). Resets Minor/Patch to 0. (e.g., `1.5.3` -> `2.0.0`)
* **MINOR**: Bumps for backward-compatible features. Resets Patch to 0. (e.g., `1.5.3` -> `1.6.0`)
* **PATCH**: Bumps for backward-compatible bug fixes. (e.g., `1.5.3` -> `1.5.4`)
* **Qualifiers**: Pre-releases use hyphens (`1.0.0-beta.1`); build metadata uses plus signs (`1.0.0+build12`).

### 2. Breaking Change Checklist (Requires MAJOR Bump)
A breaking change is any modification requiring downstream users to update their code to prevent compilation or runtime failures.

#### Compile-Time / Code Level
* **Deletions**: Removing a public class, function, method, variable, or endpoint.
* **Renamings**: Changing the name or casing of any public identifier.
* **Signature Mutations**: Changing argument types, return types, or removing arguments.
* **Strict Parameters**: Adding required arguments to existing functions without default values.
* **Access Restrictions**: Changing public exposure to private, protected, or internal.

#### Runtime / Behavioral
* **Input Tightening**: Rejecting data formats or inputs that were previously accepted.
* **Error Mutations**: Throwing new, unhandled exception types, or altering existing error models.
* **Output Structural Changes**: Changing return data shapes, keys, or formats (e.g., date formats).
* **Side-Effect Shifts**: Changing the default execution logic or outcome of an existing routine.

#### Data & Architecture
* **API Payloads**: Dropping JSON keys or mutating their data types in responses.
* **Storage Schema**: Dropping DB columns, altering column types, or adding non-null constraints without defaults (`migrations/`).
* **Configuration**: Removing or renaming required environment variables or configuration keys.

