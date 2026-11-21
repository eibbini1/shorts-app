export function moveQueueItem(queue, index, offset) {
  const target = index + offset;
  if (index < 0 || index >= queue.length || target < 0 || target >= queue.length) return queue;
  const next = [...queue];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
