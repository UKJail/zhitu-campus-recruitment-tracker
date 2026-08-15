export function safeAuthNextPath(value: string | null, fallback = "/app") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
