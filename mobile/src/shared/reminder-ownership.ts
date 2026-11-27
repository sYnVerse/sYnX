/**
 * Who may reword a task that has a reminder. The reminder's text goes to the
 * user who set it, so only that user can change the text. Reminders saved
 * before reminder_user_id existed (null) belong to the list owner. Kept free of
 * server-only imports so route UI can use it too.
 */
export function canEditReminderText(
  reminderUserId: string | null | undefined,
  listOwnerId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  const reminderOwnerId = reminderUserId || listOwnerId;
  return !reminderOwnerId || reminderOwnerId === userId;
}
