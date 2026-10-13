import { DESCRIPTION, EVENT, fullAddress } from '../data/event';

const toIcsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Builds an .ics file client-side so "Thêm vào lịch" works with any calendar app. */
export function initCalendar() {
  document.querySelectorAll<HTMLButtonElement>('[data-ics]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Artist Day Vietnam//AD21//VI',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:artistday21-20261108@artistday21.pages.dev`,
        `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
        `DTSTART:${toIcsDate(EVENT.start)}`,
        `DTEND:${toIcsDate(EVENT.end)}`,
        `SUMMARY:${escape(EVENT.name)}`,
        `DESCRIPTION:${escape(`${DESCRIPTION}\n${location.href}`)}`,
        `LOCATION:${escape(`${EVENT.spot}, ${EVENT.venue}, ${fullAddress}`)}`,
        `URL:${location.origin}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT2H',
        'ACTION:DISPLAY',
        'DESCRIPTION:Artist Day 21 sắp bắt đầu!',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'artist-day-21-wasteland.ics' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });
}
