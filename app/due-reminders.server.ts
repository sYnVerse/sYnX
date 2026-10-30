/** A due reminder joined with the settings of the user it goes to. */
export interface DueReminderRow {
  id: string;
  listId: string;
  text: string;
  reminderAt: number;
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
 * Unsent reminders on open tasks that are due at `now`, with the recipient's
 * notification settings. A reminder goes to the user who set it
 * (reminder_user_id); reminders saved before that column existed go to the
 * list owner.
 */
export async function getDueReminderRecipients(db: D1Database, now: number): Promise<DueReminderRow[]> {
  const { results } = await db.prepare(`
    SELECT 
      t.id, t.list_id as listId, t.text, t.reminder_at as reminderAt,
      COALESCE(t.reminder_user_id, l.owner_id) as userId, l.name as listName,
      s.email, s.email_enabled as emailEnabled, s.sms_enabled as smsEnabled, 
      s.phone_number as phoneNumber, s.phone_carrier as phoneCarrier, s.discord_webhook_url as discordWebhookUrl
    FROM todos t
    JOIN lists l ON t.list_id = l.id
    LEFT JOIN user_settings s ON COALESCE(t.reminder_user_id, l.owner_id) = s.user_id
    WHERE t.completed = 0 
      AND t.reminder_at IS NOT NULL 
      AND (t.reminder_sent IS NULL OR t.reminder_sent = 0)
      AND t.reminder_at <= ?
  `).bind(now).all<DueReminderRow>();
  return results || [];
}
