/** "YYYYMMDDTHHMMSSZ" — the UTC timestamp format ICS and Google Calendar URLs both require. */
function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  uid: string;
}

/** Downloads a .ics file so the booking can be added to any desktop/mobile calendar app. */
export function downloadIcsFile(event: CalendarEvent) {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Turfly//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}@turfly`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
    `LOCATION:${event.location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'booking.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsUtc(event.start)}/${toIcsUtc(event.end)}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** OpenStreetMap directions link — falls back to a text search when no coordinates are known. */
export function directionsUrl(location: string, geo?: { coordinates: [number, number] }): string {
  if (geo?.coordinates) {
    const [lng, lat] = geo.coordinates;
    return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`;
  }
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}`;
}
