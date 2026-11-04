/** Choose a future daily slot independently of the host timezone. */
export function nextPublishSlot(now: Date, reserved: string[], hour = 20, utcOffsetHours = 3): string {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isFinite(utcOffsetHours) || Math.abs(utcOffsetHours) > 14) throw new Error('Invalid publishing time configuration');
  const local = new Date(now.getTime() + utcOffsetHours * 3600000);
  const first = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) - utcOffsetHours * 3600000;
  const occupied = new Set(reserved.map(t => new Date(new Date(t).getTime() + utcOffsetHours * 3600000).toISOString().slice(0, 10)));
  for (let day = 0; day < 366; day++) {
    const candidate = new Date(first + day * 86400000);
    const date = new Date(candidate.getTime() + utcOffsetHours * 3600000).toISOString().slice(0, 10);
    if (candidate.getTime() > now.getTime() + 3600000 && !occupied.has(date)) return candidate.toISOString();
  }
  throw new Error('No free publishing slot within the next year');
}
