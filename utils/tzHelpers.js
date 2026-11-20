// Timezone-aware date helpers used by the customer portal (cancellation cut-offs, calendar).
// All delivery dates stay YYYY-MM-DD strings, same as the rest of the system.

const DEFAULT_TZ = 'Asia/Kolkata';

const safeTz = (tz) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz || DEFAULT_TZ });
    return tz || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
};

// Current date key + minutes-since-midnight in the company's timezone.
const nowInTz = (tz) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
};

// YYYY-MM-DD of an arbitrary instant, as seen in the company's timezone.
const dateKeyOf = (date, tz) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(date));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const isValidDateKey = (key) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return false;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const addDays = (dateKey, n) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const monthRange = (year, month) => {
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
  };
};

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

const format12h = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, '0')} ${suffix}`;
};

const prettyDate = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
};

module.exports = {
  DEFAULT_TZ,
  safeTz,
  nowInTz,
  dateKeyOf,
  isValidDateKey,
  addDays,
  daysInMonth,
  monthRange,
  toMinutes,
  format12h,
  prettyDate,
};
