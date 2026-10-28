import { addDays, addMonths, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : parseISO(value);
}

export function isoDate(value: string | Date): string {
  return format(toDate(value), "yyyy-MM-dd");
}

export function isoDateTime(value: string | Date): string {
  return toDate(value).toISOString();
}

export function daysUntil(target: string | Date, from: Date = new Date()): number {
  return differenceInCalendarDays(toDate(target), from);
}

export function nextDueDate(dueDate: Date, recurrence: string, from: Date): Date {
  let next = new Date(dueDate);
  if (next >= from) return next;
  switch (recurrence) {
    case "weekly":
      while (next < from) next = addDays(next, 7);
      return next;
    case "monthly":
      while (next < from) next = addMonths(next, 1);
      return next;
    case "yearly":
      while (next < from) next = addMonths(next, 12);
      return next;
    default:
      return next;
  }
}

export function friendlyDate(value: string | Date, locale = "en-US"): string {
  const d = toDate(value);
  if (!isValid(d)) return "—";
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function relativeDate(value: string | Date): string {
  const d = toDate(value);
  const days = differenceInCalendarDays(d, new Date());
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days <= 14) return `In ${days} days`;
  if (days < -1 && days >= -14) return `${Math.abs(days)} days ago`;
  return friendlyDate(d);
}

export function monthKey(value: string | Date): string {
  return format(toDate(value), "yyyy-MM");
}

export function monthLabel(value: string | Date): string {
  return format(toDate(value), "MMM");
}

export function nextOccurrence(date: Date, recurrence: string): Date | null {
  if (recurrence === "weekly") return addDays(date, 7);
  if (recurrence === "monthly") return addMonths(date, 1);
  if (recurrence === "yearly") return addMonths(date, 12);
  return null;
}
