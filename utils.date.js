const { addDays, format, nextSunday, isSunday, startOfDay } = require('date-fns');

function getNextSunday(fromDate = new Date()) {
  const today = startOfDay(fromDate);
  if (isSunday(today)) {
    // If today is Sunday, we want the *next* Sunday per requirements
    return addDays(today, 7);
  }
  return nextSunday(today);
}

function formatDisplayDate(date) {
  return format(date, 'EEEE, MMMM d, yyyy');
}

function formatServiceTime(date) {
  return format(date, 'h:mm a');
}

module.exports = {
  getNextSunday,
  formatDisplayDate,
  formatServiceTime,
};


