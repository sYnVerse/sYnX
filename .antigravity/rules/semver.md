# Software Versioning & Breaking Change Rules for Antigravity AI

Antigravity AI Coding Assistant Rule: Maintain strict Semantic Versioning (SemVer) and track breaking changes across Web and Mobile platforms.

Current Baselines:
- Web: `v8.0.2`
- Mobile: `v4.0.0`

## 1. Semantic Versioning (SemVer) Format
Format: **MAJOR.MINOR.PATCH**
* **MAJOR**: Bumps for incompatible API changes (breaking changes). Resets Minor/Patch to 0. (e.g., `1.5.3` -> `2.0.0`)
* **MINOR**: Bumps for backward-compatible features. Resets Patch to 0. (e.g., `1.5.3` -> `1.6.0`)
* **PATCH**: Bumps for backward-compatible bug fixes. (e.g., `1.5.3` -> `1.5.4`)
* **Qualifiers**: Pre-releases use hyphens (`1.0.0-beta.1`); build metadata uses plus signs (`1.0.0+build12`).

## 2. Breaking Change Checklist (Requires MAJOR Bump)
A breaking change is any modification requiring downstream users to update their code to prevent compilation or runtime failures.

### Compile-Time / Code Level
* **Deletions**: Removing a public class, function, method, variable, or endpoint.
* **Renamings**: Changing the name or casing of any public identifier.
* **Signature Mutations**: Changing argument types, return types, or removing arguments.
* **Strict Parameters**: Adding required arguments to existing functions without default values.
* **Access Restrictions**: Changing public exposure to private, protected, or internal.

### Runtime / Behavioral
* **Input Tightening**: Rejecting data formats or inputs that were previously accepted.
* **Error Mutations**: Throwing new, unhandled exception types, or altering existing error models.
* **Output Structural Changes**: Changing return data shapes, keys, or formats (e.g., date formats).
* **Side-Effect Shifts**: Changing the default execution logic or outcome of an existing routine.

### Data & Architecture
* **API Payloads**: Dropping JSON keys or mutating their data types in responses.
* **Storage Schema**: Dropping DB columns, altering column types, or adding non-null constraints without defaults (`schema.sql`).
* **Configuration**: Removing or renaming required environment variables or configuration keys.
