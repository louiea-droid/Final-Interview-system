/*
 * Whether an announcement should appear on the /visual board right now.
 *
 * `active` is the admin's manual on/off switch. `scheduled_at`, when set,
 * holds the announcement back until that moment - both are optional and
 * independent, so a scheduled announcement that's also been switched off
 * stays off even once its time arrives.
 */
export function isShownOnBoard(announcement) {
  if (announcement.active === false) return false;
  if (!announcement.scheduled_at) return true;
  return new Date(announcement.scheduled_at) <= new Date();
}

/** Whether an announcement is switched on but still waiting on its scheduled time. */
export function isUpcoming(announcement) {
  return (
    announcement.active !== false &&
    Boolean(announcement.scheduled_at) &&
    new Date(announcement.scheduled_at) > new Date()
  );
}
