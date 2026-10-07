// Dates (standard §3.10, Appendix A.7), adapted to Gabay: UTC everywhere (Blueprint invariant 12).
// Timestamps are TIMESTAMPTZ and travel as ISO-8601 UTC instants. A DATE column is a calendar day,
// and the db layer returns it as 'YYYY-MM-DD' text already; projectDates() is the service-boundary
// guarantee that every DATE column leaves the API in that one form, whatever produced the row.
'use strict';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}/;

/**
 * 'YYYY-MM-DD' from a calendar-day value, or null when there is none or it is invalid.
 * A string uses its leading date part. A Date uses its UTC components (an instant is UTC here).
 */
function dateOnly(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const match = DATE_ONLY.exec(value.trim());
    if (!match) return null;
    const day = match[0];
    // Round-trip: Date rolls 2026-02-31 over to 2026-03-03, so a day that changes was never a real one.
    const parsed = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
      ? day
      : null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  return null;
}

/** Row mapper for the service boundary: `rows.map(projectDates(['StartDate', 'EndDate']))`. */
function projectDates(columns) {
  return (row) => {
    for (const column of columns) {
      if (row[column] !== undefined) row[column] = dateOnly(row[column]);
    }
    return row;
  };
}

module.exports = { dateOnly, projectDates };
