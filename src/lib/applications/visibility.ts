export const APPLICATION_DELETED_ACTION = "deleted_by_user";
export const APPLICATION_RESTORED_ACTION = "restored_by_user";

type ApplicationVisibilityEvent = {
  metadata: unknown;
};

function eventAction(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const action = (metadata as Record<string, unknown>).action;
  return typeof action === "string" ? action : null;
}

/** Events must be supplied newest first. */
export function isApplicationHidden(events: ApplicationVisibilityEvent[]) {
  for (const event of events) {
    const action = eventAction(event.metadata);
    if (action === APPLICATION_RESTORED_ACTION) return false;
    if (action === APPLICATION_DELETED_ACTION) return true;
  }
  return false;
}
