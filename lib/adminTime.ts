function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute ?? 0,
  };
}

export function getEasternBatchStart(date = new Date()) {
  const easternParts = getTimeZoneParts(date, 'America/New_York');
  const easternDay = Date.UTC(
    easternParts.year,
    easternParts.month - 1,
    easternParts.day,
    easternParts.hour
  );
  const batchDay = easternParts.hour < 19
    ? easternDay - 24 * 60 * 60 * 1000
    : easternDay;
  const batchWallTime = new Date(batchDay);
  const wallTimeMs = Date.UTC(
    batchWallTime.getUTCFullYear(),
    batchWallTime.getUTCMonth(),
    batchWallTime.getUTCDate(),
    19
  );
  const offsetParts = getTimeZoneParts(new Date(wallTimeMs), 'America/New_York');
  const offsetMs = Date.UTC(
    offsetParts.year,
    offsetParts.month - 1,
    offsetParts.day,
    offsetParts.hour,
    offsetParts.minute
  ) - wallTimeMs;

  return new Date(wallTimeMs - offsetMs);
}

export function formatCurrentTime(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatCurrentDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}
