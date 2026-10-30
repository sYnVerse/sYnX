/**
 * Size limits for everything people can write into sYnX. The server enforces
 * them on every write path (web actions and the mobile API); the web inputs use
 * the same numbers as maxLength so people hit them while typing, not on save.
 */
export const MAX_TASK_TEXT_LENGTH = 1000;
export const MAX_LIST_NAME_LENGTH = 100;
export const MAX_CATEGORY_LENGTH = 50;
/** Tasks per list, subtasks included. */
export const MAX_TASKS_PER_LIST = 1000;

/** Friendly error for task text that is too long, or null when it fits. */
export function taskTextError(text: string): string | null {
  return text.length > MAX_TASK_TEXT_LENGTH
    ? `Tasks can be up to ${MAX_TASK_TEXT_LENGTH} characters.`
    : null;
}

/** Friendly error for a list name that is too long, or null when it fits. */
export function listNameError(name: string): string | null {
  return name.length > MAX_LIST_NAME_LENGTH
    ? `List names can be up to ${MAX_LIST_NAME_LENGTH} characters.`
    : null;
}

/** Friendly error for a category that is too long, or null when it fits. */
export function categoryError(category: string): string | null {
  return category.length > MAX_CATEGORY_LENGTH
    ? `Categories can be up to ${MAX_CATEGORY_LENGTH} characters.`
    : null;
}

export const MAX_PHONE_NUMBER_LENGTH = 32;
export const MAX_PHONE_CARRIER_LENGTH = 64;

/**
 * Error for an SMS phone number or carrier that is too long, or null when both
 * fit. Pass trimmed values; the settings routes store them trimmed.
 */
export function phoneSettingsError(phoneNumber: string, phoneCarrier: string): string | null {
  if (phoneNumber.length > MAX_PHONE_NUMBER_LENGTH) return "Phone number is too long";
  if (phoneCarrier.length > MAX_PHONE_CARRIER_LENGTH) return "Phone carrier is too long";
  return null;
}

export const TASK_LIMIT_ERROR = `This list is full (${MAX_TASKS_PER_LIST} tasks). Clear some tasks to add more.`;
