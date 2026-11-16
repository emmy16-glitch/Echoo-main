type Response = { actionIdentifier: string; notification: { request: { identifier: string; content: { data: Record<string, unknown> } } } };

export function createNotificationResponseHandler(open: (data: Record<string, unknown>) => void, clear: () => Promise<void>) {
  const handled = new Set<string>();
  return (response: Response | null) => {
    if (!response) return;
    const { identifier, content } = response.notification.request;
    const key = `${identifier}:${response.actionIdentifier}`;
    if (handled.has(key)) return;
    handled.add(key);
    if (handled.size > 100) handled.delete(handled.values().next().value!);
    // Both the cold-start response and live callback can report the same tap.
    void clear().catch(() => undefined);
    if (content.data?.broadcastId && content.data?.type === 'broadcast_live') open(content.data);
  };
}
