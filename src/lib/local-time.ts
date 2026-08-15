const weekdayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;

export function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 14) return "中午好";
  return "晚上好";
}

export function greetingWithId(hour: number, displayName?: string | null) {
  const greeting = greetingForHour(hour);
  const userId = displayName?.trim();
  return userId ? `${greeting}，${userId}` : greeting;
}

export function formatLocalChineseDate(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdayNames[date.getDay()]}`;
}
