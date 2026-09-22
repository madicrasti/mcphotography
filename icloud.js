// iCloud Calendar over CalDAV, using an Apple ID app-specific password.
// Pushes shoots into one calendar (default "Shoots") and reads your other iCloud calendars for busy times.
const ROOT = 'https://caldav.icloud.com/';
const RX = (tag) => new RegExp('<(?:[\\w-]+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + tag + '>', 'i');
const RXG = (tag) => new RegExp('<(?:[\\w-]+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + tag + '>', 'gi');
const unxml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;/g, '\r').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');

function auth(user, pass) { return 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass))); }
async function dav(method, url, user, pass, body, headers) {
  const r = await fetch(url, { method, headers: Object.assign({ Authorization: auth(user, pass), 'Content-Type': 'application/xml; charset=utf-8' }, headers || {}), body });
  const text = await r.text();
  if (r.status === 401) throw new Error('iCloud rejected the Apple ID or app-specific password.');
  if (r.status >= 400) throw new Error('iCloud ' + method + ' failed (' + r.status + ')');
  return { status: r.status, text, url: r.url };
}
function abs(href, base) { return new URL(href.trim(), base).toString(); }

export async function icloudConnect(user, pass, calendarName) {
  const p1 = await dav('PROPFIND', ROOT, user, pass, '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', { Depth: '0' });
  const principal = (RX('current-user-principal').exec(p1.text) || [])[1];
  const pHref = principal && (RX('href').exec(principal) || [])[1];
  if (!pHref) throw new Error('Couldn\'t find your iCloud calendars.');
  const pUrl = abs(pHref, p1.url);
  const p2 = await dav('PROPFIND', pUrl, user, pass, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>', { Depth: '0' });
  const hs = (RX('calendar-home-set').exec(p2.text) || [])[1];
  const home = abs((RX('href').exec(hs || '') || [])[1] || '', pUrl);
  const cals = await listCalendars(home, user, pass);
  let target = cals.find((c) => c.name.toLowerCase() === (calendarName || 'Shoots').toLowerCase());
  if (!target) {
    const href = home.replace(/\/?$/, '/') + crypto.randomUUID().toUpperCase() + '/';
    await dav('MKCALENDAR', href, user, pass, '<?xml version="1.0" encoding="UTF-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:set><d:prop><d:displayname>' + (calendarName || 'Shoots') + '</d:displayname><a:calendar-color>#001A5BFF</a:calendar-color><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>');
    target = { url: href, name: calendarName || 'Shoots' };
    cals.push(target);
  }
  return { user, pass, home, target: target.url, targetName: target.name, others: cals.filter((c) => c.url !== target.url).map((c) => c.url) };
}
async function listCalendars(home, user, pass) {
  const r = await dav('PROPFIND', home, user, pass, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>', { Depth: '1' });
  const out = [];
  (r.text.match(RXG('response')) || []).forEach((resp) => {
    const rt = (RX('resourcetype').exec(resp) || [])[1] || '';
    if (!/<(?:[\w-]+:)?calendar[\s/>]/i.test(rt)) return;
    const comps = (RX('supported-calendar-component-set').exec(resp) || [])[1] || '';
    if (comps && !/VEVENT/i.test(comps)) return;
    out.push({ url: abs((RX('href').exec(resp) || [])[1], home), name: unxml((RX('displayname').exec(resp) || [])[1] || '') });
  });
  return out;
}

/* ---- ICS helpers ---- */
function icsDate(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function esc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function fold(line) { const out = []; let s = line; while (new TextEncoder().encode(s).length > 74) { let i = 74; while (new TextEncoder().encode(s.slice(0, i)).length > 74) i--; out.push(s.slice(0, i)); s = ' ' + s.slice(i); } out.push(s); return out.join('\r\n'); }
export function buildIcs(uid, ev) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Madi Crasti Photography//Booking site//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:' + uid, 'DTSTAMP:' + icsDate(Date.now()), 'DTSTART:' + icsDate(ev.startMs), 'DTEND:' + icsDate(ev.endMs),
    'SUMMARY:' + esc(ev.summary), 'LOCATION:' + esc(ev.location), 'DESCRIPTION:' + esc(ev.description), 'X-MC-BOOKING:1',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(ev.summary), 'TRIGGER:-PT2H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}
function parseIcsTime(key, val) {
  const C = globalThis.MCcore;
  if (/VALUE=DATE(?!-)/.test(key) || /^\d{8}$/.test(val)) return { ms: C.sydToUtc(val.slice(0, 4) + '-' + val.slice(4, 6) + '-' + val.slice(6, 8), 0), allDay: true };
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(val); if (!m) return null;
  if (m[7] === 'Z') return { ms: Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) };
  return { ms: C.sydToUtc(m[1] + '-' + m[2] + '-' + m[3], +m[4] * 60 + +m[5]) }; // TZID or floating: treat as Sydney
}
function parseDuration(d) { const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(d || ''); return m ? ((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 60000 : 0; }
export function parseBusy(ics) {
  const text = ics.replace(/\r?\n[ \t]/g, '');
  const out = [];
  (text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []).forEach((ve) => {
    const f = {}; ve.split(/\r?\n/).forEach((ln) => { const i = ln.indexOf(':'); if (i < 0) return; const k = ln.slice(0, i), v = ln.slice(i + 1); f[k.split(';')[0]] = { key: k, v }; });
    if (f['X-MC-BOOKING']) return;
    if (f.STATUS && /CANCELLED/i.test(f.STATUS.v)) return;
    const transp = f.TRANSP ? f.TRANSP.v.trim().toUpperCase() : '';
    if (transp === 'TRANSPARENT') return;
    const s = f.DTSTART && parseIcsTime(f.DTSTART.key, f.DTSTART.v.trim()); if (!s) return;
    if (s.allDay && transp !== 'OPAQUE') return;
    let e = f.DTEND && parseIcsTime(f.DTEND.key, f.DTEND.v.trim());
    const endMs = e ? e.ms : s.ms + (parseDuration(f.DURATION && f.DURATION.v) || (s.allDay ? 86400000 : 3600000));
    out.push({ id: f.UID ? f.UID.v.trim() : undefined, startMs: s.ms, endMs, label: 'iCloud: ' + (f.SUMMARY ? f.SUMMARY.v.replace(/\\,/g, ',').replace(/\\n/g, ' ') : 'Busy') });
  });
  return out;
}

export function icloudIO(store) {
  async function cfg() { return await store.getSecret('icloud'); }
  return {
    async connected() { const c = await cfg(); return c ? { connected: true, detail: 'Shoots go into "' + c.targetName + '"; ' + (c.others || []).length + ' other calendars block times.' } : { connected: false, detail: 'Connect with an Apple ID app-specific password.' }; },
    async busy(fromMs, toMs) {
      const c = await cfg(); if (!c) return [];
      const range = '<c:time-range start="' + icsDate(fromMs) + '" end="' + icsDate(toMs) + '"/>';
      const body = '<?xml version="1.0" encoding="UTF-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data><c:expand start="' + icsDate(fromMs) + '" end="' + icsDate(toMs) + '"/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">' + range + '</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>';
      const out = [];
      await Promise.all((c.others || []).slice(0, 12).map(async (url) => {
        try {
          const r = await dav('REPORT', url, c.user, c.pass, body, { Depth: '1' });
          (r.text.match(RXG('calendar-data')) || []).forEach((cd) => { out.push(...parseBusy(unxml((RX('calendar-data').exec(cd) || [])[1]))); });
        } catch (_) { /* one unreadable calendar shouldn't break booking */ }
      }));
      return out.filter((e) => e.endMs > fromMs && e.startMs < toMs);
    },
    async upsertEvent(uid, ev) {
      const c = await cfg(); if (!c) return null;
      await dav('PUT', c.target.replace(/\/?$/, '/') + uid + '.ics', c.user, c.pass, buildIcs(uid, ev), { 'Content-Type': 'text/calendar; charset=utf-8' });
      return uid;
    },
    async deleteEvent(uid) {
      const c = await cfg(); if (!c || !uid) return;
      try { await dav('DELETE', c.target.replace(/\/?$/, '/') + uid + '.ics', c.user, c.pass); } catch (e) { if (!/\(404\)/.test(e.message)) throw e; }
    }
  };
}
