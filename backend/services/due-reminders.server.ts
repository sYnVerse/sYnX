/** A due reminder joined with the settings of the user it goes to. */
export interface DueReminderRow {
  id: string;
  listId: string;
  text: string;
  reminderAt: number;
  recurrence?: string | null;
  userId: string;
  listName: string | null;
  email: string | null;
  emailEnabled: number | boolean | null;
  smsEnabled: number | boolean | null;
  phoneNumber: string | null;
  phoneCarrier: string | null;
  discordWebhookUrl: string | null;
}

/**
 * Marks due reminders as handled when their recipient has archived the list so
 * reminders that came due while archived are not delivered late after unarchive.
 */
export async function suppressDueRemindersForArchivedRecipients(
  db: D1Database,
  now: number,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE todos
       SET reminder_sent = 1
       WHERE completed = 0
         AND reminder_at IS NOT NULL
         AND (reminder_sent IS NULL OR reminder_sent = 0)
         AND reminder_at <= ?
         AND EXISTS (
           SELECT 1
           FROM lists l
           JOIN list_archives la
             ON la.list_id = l.id
            AND la.user_id = COALESCE(todos.reminder_user_id, l.owner_id)
           WHERE l.id = todos.list_id
         )`,
    )
    .bind(now)
    .run();
  return result.meta?.changes ?? 0;
}

/**
 * Unsent reminders on open tasks that are due at `now`, with the recipient's
 * notification settings. A reminder goes to the user who set it
 * (reminder_user_id); reminders saved before that column existed go to the
 * list owner. Reminders whose recipient archived that list are excluded.
 */
export async function getDueReminderRecipients(db: D1Database, now: number): Promise<DueReminderRow[]> {
  const { results } = await db.prepare(`
    SELECT 
      t.id, t.list_id as listId, t.text, t.reminder_at as reminderAt, t.recurrence as recurrence,
      COALESCE(t.reminder_user_id, l.owner_id) as userId, l.name as listName,
      s.email, s.email_enabled as emailEnabled, s.sms_enabled as smsEnabled, 
      s.phone_number as phoneNumber, s.phone_carrier as phoneCarrier, s.discord_webhook_url as discordWebhookUrl
    FROM todos t
    JOIN lists l ON t.list_id = l.id
    LEFT JOIN user_settings s ON COALESCE(t.reminder_user_id, l.owner_id) = s.user_id
    LEFT JOIN list_archives la ON la.list_id = t.list_id AND la.user_id = COALESCE(t.reminder_user_id, l.owner_id)
    WHERE t.completed = 0 
      AND t.reminder_at IS NOT NULL 
      AND (t.reminder_sent IS NULL OR t.reminder_sent = 0)
      AND t.reminder_at <= ?
      AND la.list_id IS NULL
  `).bind(now).all<DueReminderRow>();
  return results || [];
}
