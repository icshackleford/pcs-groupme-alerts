const { getTomorrow, formatDisplayDate, formatServiceTime } = require('./utils.date');
const { addDays, subHours, differenceInHours, format, startOfDay } = require('date-fns');
const { toZonedTime, fromZonedTime } = require('date-fns-tz');
const config = require('./config');
const {
  getPlansForWeekRange,
  getTeamMembersForPlan,
  getNeededPositions,
} = require('./services.planningCenter');
const { postMessage, formatScheduleMessage } = require('./services.groupMe');
const cron = require('node-cron');

// Eastern timezone for all timing calculations
const EASTERN_TZ = 'America/New_York';

// Track which events we've already posted for (to avoid duplicate posts)
const postedEvents = new Set();

function getEventKey(planId, serviceTime) {
  if (!serviceTime) return `plan-${planId}`;
  const dateKey = format(startOfDay(serviceTime), 'yyyy-MM-dd');
  return `${planId}-${dateKey}`;
}

async function findUpcomingEvents() {
  const now = new Date();
  const lookAheadDays = 7; // Look ahead 7 days for upcoming events
  const endDate = addDays(now, lookAheadDays);
  
  // Fetch all plans in the next 7 days
  const plans = await getPlansForWeekRange(
    config.planningCenter.serviceTypeId,
    now,
    endDate
  );

  if (!plans || plans.length === 0) {
    return [];
  }

  // For each plan, find the earliest service time
  const upcomingEvents = [];
  
  for (const plan of plans) {
    const teamMembers = await getTeamMembersForPlan(
      config.planningCenter.serviceTypeId,
      plan.id,
      config.teams.names
    );
    
    const neededPositions = await getNeededPositions(
      config.planningCenter.serviceTypeId,
      plan.id
    );

    // Find earliest service time from team members
    let earliestTime = null;
    for (const member of teamMembers) {
      if (member.rawStartTime) {
        const serviceTime = new Date(member.rawStartTime);
        if (!Number.isNaN(serviceTime.getTime())) {
          if (!earliestTime || serviceTime.getTime() < earliestTime.getTime()) {
            earliestTime = serviceTime;
          }
        }
      }
    }

    // Also check needed positions for earlier times
    for (const np of neededPositions) {
      if (np.rawStartTime) {
        const serviceTime = new Date(np.rawStartTime);
        if (!Number.isNaN(serviceTime.getTime())) {
          if (!earliestTime || serviceTime.getTime() < earliestTime.getTime()) {
            earliestTime = serviceTime;
          }
        }
      }
    }

    if (earliestTime && earliestTime > now) {
      upcomingEvents.push({
        plan,
        earliestTime,
        teamMembers,
        neededPositions,
      });
    }
  }

  // Sort by earliest time
  upcomingEvents.sort((a, b) => a.earliestTime.getTime() - b.earliestTime.getTime());
  
  return upcomingEvents;
}

async function runOnce() {
  console.log('Running Planning Center → GroupMe bot check...');
  try {
    // Convert current time to Eastern timezone for all calculations
    const nowUTC = new Date();
    const now = toZonedTime(nowUTC, EASTERN_TZ); // Convert to Eastern time
    const upcomingEvents = await findUpcomingEvents();

    if (upcomingEvents.length === 0) {
      console.log('No upcoming events found in the next 7 days.');
      return;
    }

    // Group events by date (YYYY-MM-DD) using local date
    const eventsByDate = {};
    for (const event of upcomingEvents) {
      const dateKey = format(startOfDay(event.earliestTime), 'yyyy-MM-dd');
      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = [];
      }
      eventsByDate[dateKey].push(event);
    }

    // For each date, find the earliest service time and check if we should post
    for (const dateKey of Object.keys(eventsByDate).sort()) {
      const dateEvents = eventsByDate[dateKey];
      
      // Find the earliest service time across all events on this date
      let earliestTimeForDate = null;
      for (const event of dateEvents) {
        if (!earliestTimeForDate || event.earliestTime.getTime() < earliestTimeForDate.getTime()) {
          earliestTimeForDate = event.earliestTime;
        }
      }

      const eventKey = `date-${dateKey}`;
      
      // Skip if we've already posted for this date
      if (postedEvents.has(eventKey)) {
        continue;
      }

      // Convert earliestTimeForDate to Eastern timezone for calculation
      const earliestTimeEastern = toZonedTime(earliestTimeForDate, EASTERN_TZ);
      
      // Calculate 24 hours before the first service time for this date (in Eastern time)
      const postTime = subHours(earliestTimeEastern, 24);
      
      // Check if we're within 1 hour of the post time (to account for hourly cron)
      // Both times are now in Eastern timezone
      const hoursUntilPost = differenceInHours(postTime, now);
      
      if (hoursUntilPost >= 0 && hoursUntilPost < 1) {
        console.log(`Posting schedule for events on ${formatDisplayDate(earliestTimeForDate)} (24 hours before first service at ${formatServiceTime(earliestTimeForDate)})`);
        
        // Get the date of the event at midnight local time
        const eventDate = startOfDay(earliestTimeForDate);
        const eventDateKey = format(eventDate, 'yyyy-MM-dd');
        
        // Combine all team members and needed positions from all events on this date
        // Filter to only include those that match the target date
        const allTeamMembers = [];
        const allNeededPositions = [];
        
        for (const event of dateEvents) {
          // Filter team members to only those for the target date
          for (const member of event.teamMembers) {
            if (member.rawStartTime) {
              const serviceTime = new Date(member.rawStartTime);
              if (!Number.isNaN(serviceTime.getTime())) {
                const memberDate = startOfDay(serviceTime);
                const memberDateKey = format(memberDate, 'yyyy-MM-dd');
                if (memberDateKey === eventDateKey) {
                  allTeamMembers.push(member);
                }
              }
            }
          }
          
          // Filter needed positions to only those for the target date
          for (const np of event.neededPositions) {
            if (np.rawStartTime) {
              const serviceTime = new Date(np.rawStartTime);
              if (!Number.isNaN(serviceTime.getTime())) {
                const npDate = startOfDay(serviceTime);
                const npDateKey = format(npDate, 'yyyy-MM-dd');
                if (npDateKey === eventDateKey) {
                  allNeededPositions.push(np);
                }
              }
            }
          }
        }

        // Convert rawStartTime strings to Date instances
        const normalizedForFormatting = allTeamMembers.map((m) => {
          let serviceTime = null;
          if (m.rawStartTime) {
            const parsed = new Date(m.rawStartTime);
            if (!Number.isNaN(parsed.getTime())) {
              serviceTime = parsed;
            }
          }
          return {
            ...m,
            serviceTime,
          };
        });

        // Normalize needed positions with service times
        const normalizedNeededPositions = allNeededPositions.map((np) => {
          let serviceTime = null;
          if (np.rawStartTime) {
            const parsed = new Date(np.rawStartTime);
            if (!Number.isNaN(parsed.getTime())) {
              serviceTime = parsed;
            }
          }
          return {
            ...np,
            serviceTime,
          };
        });

        const text = formatScheduleMessage(
          normalizedForFormatting,
          eventDate,
          formatServiceTime,
          normalizedNeededPositions
        );

        console.log('Formatted message:\n', text);
        await postMessage(text);
        
        // Mark this date as posted
        postedEvents.add(eventKey);
        
        // Only post one date per run
        break;
      } else if (hoursUntilPost < 0) {
        // We've passed the post time, mark as posted to avoid trying again
        postedEvents.add(eventKey);
      }
    }
  } catch (err) {
    console.error('Error running bot:', err.message || err);
  }
}

function startCron() {
  // Run every hour to check if we're 24 hours before the first service time
  const expression = '0 * * * *';
  console.log(`Scheduling hourly job with cron: "${expression}"`);
  console.log('Bot will post 24 hours before the first service time of each event.');
  cron.schedule(expression, () => {
    console.log('Cron trigger: checking for events to post...');
    runOnce();
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--once')) {
    runOnce();
  } else {
    startCron();
    console.log('Bot is running and will check hourly for events to post.');
    console.log('Posts will be sent 24 hours before the first service time of each event.');
    console.log('Process will stay alive to execute scheduled jobs.');
    // Also allow immediate run on startup for easier debugging if desired:
    // runOnce();
  }
}

module.exports = {
  runOnce,
  startCron,
};


