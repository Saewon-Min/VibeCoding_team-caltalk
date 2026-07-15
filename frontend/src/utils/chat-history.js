export function mergeNewMessages(existing, incoming) {
  if (incoming.length === 0) {
    return existing;
  }
  const existingIds = new Set(existing.map((message) => message.id));
  const newMessages = incoming.filter((message) => !existingIds.has(message.id));
  return [...existing, ...newMessages];
}

export function getNextSince(currentSince, incoming) {
  if (incoming.length === 0) {
    return currentSince;
  }
  return incoming[incoming.length - 1].createdAt;
}
