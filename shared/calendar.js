// "Add to calendar" for a booked session (Nov 24, 2026). The Google event's own
// link only opens for the calendar that owns it — a member clicking it got
// "Could not find the requested event". This builds a Google Calendar "add
// event" link from the booking itself, so it works for anyone signed in to
// any Google account.
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function addToCalendarUrl({ title, startIso, minutes = 45, joinUrl = '', details = '' }) {
  if (!startIso) return '';
  const end = new Date(new Date(startIso).getTime() + minutes * 60000);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Session with Dr. Gina Merritt',
    dates: `${stamp(startIso)}/${stamp(end)}`,
    details: [joinUrl ? `Join: ${joinUrl}` : '', details].filter(Boolean).join('\n\n'),
    ...(joinUrl ? { location: joinUrl } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
