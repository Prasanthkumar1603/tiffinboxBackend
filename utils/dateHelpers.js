// All dates in the delivery system are stored as YYYY-MM-DD strings (company timezone-agnostic
// at the DB layer; frontend/cron is responsible for timezone-correct "today").

const toDateKey = (date = new Date()) => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const todayKey = () => toDateKey(new Date());

const tomorrowKey = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
};

const daysUntil = (endDate) => {
  const diffMs = new Date(endDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

module.exports = { toDateKey, todayKey, tomorrowKey, daysUntil };
