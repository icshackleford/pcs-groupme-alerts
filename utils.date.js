const { addDays, format, nextSunday, isSunday, startOfDay, getDay } = require('date-fns');
const { formatInTimeZone } = require('date-fns-tz');

function getNextSunday(fromDate = new Date()) {
  const today = startOfDay(fromDate);
  if (isSunday(today)) {
    // If today is Sunday, we want the *next* Sunday per requirements
    return addDays(today, 7);
  }
  return nextSunday(today);
}

function getWeekRange(sundayDate) {
  // Given a Sunday date, return the Monday-Sunday range for that week
  // Sunday is day 0, so Monday is 6 days before Sunday
  const sunday = startOfDay(sundayDate);
  const monday = addDays(sunday, -6);
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(addDays(monday, i));
  }
  return {
    monday,
    sunday,
    allDates: weekDates,
    dateKeys: weekDates.map(d => format(startOfDay(d), 'yyyy-MM-dd')) // YYYY-MM-DD format using local date
  };
}

function formatDisplayDate(date) {
  return format(date, 'EEEE, MMMM d, yyyy');
}

function getTomorrow(fromDate = new Date()) {
  const today = startOfDay(fromDate);
  return addDays(today, 1);
}

function formatServiceTime(date) {
  // Explicitly format in EST/EDT timezone (America/New_York)
  // This ensures consistent time display regardless of server timezone
  return formatInTimeZone(date, 'America/New_York', 'h:mm a');
}

module.exports = {
  getNextSunday,
  getTomorrow,
  getWeekRange,
  formatDisplayDate,
  formatServiceTime,
};


