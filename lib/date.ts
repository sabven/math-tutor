// The family is in Singapore (UTC+8, no DST). "Today"/streaks must be computed
// in their local calendar day, not the server's (AWS Lambda defaults to UTC).
export const STUDENT_TIMEZONE = "Asia/Singapore";

export function localDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STUDENT_TIMEZONE }).format(date);
}

export function startOfDay(date: Date): Date {
  return new Date(`${localDateString(date)}T00:00:00+08:00`);
}

export function endOfDay(date: Date): Date {
  return new Date(`${localDateString(date)}T23:59:59.999+08:00`);
}
