const { formatDisplayDate, formatServiceTime } = require('./utils.date');
const { addDays, format, startOfDay } = require('date-fns');
const config = require('./config');
const {
  getPlansForWeekRange,
  getTeamMembersForPlan,
  getNeededPositions,
} = require('./services.planningCenter');
const { postMessage, formatScheduleMessage } = require('./services.groupMe');

async function testIndexNow() {
  console.log('Testing index.js logic - forcing post for tomorrow...\n');
  try {
    const now = new Date();
    const tomorrow = addDays(now, 1);
    const tomorrowStart = startOfDay(tomorrow);
    const tomorrowDateKey = format(tomorrowStart, 'yyyy-MM-dd');
    
    console.log(`Looking for events on: ${formatDisplayDate(tomorrowStart)}\n`);
    
    // Fetch all plans in the next 7 days (same as index.js)
    const lookAheadDays = 7;
    const endDate = addDays(now, lookAheadDays);
    const plans = await getPlansForWeekRange(
      config.planningCenter.serviceTypeId,
      now,
      endDate
    );

    if (!plans || plans.length === 0) {
      console.log('No upcoming events found.');
      return;
    }

    // Find plans that have events tomorrow (same logic as index.js)
    const tomorrowEvents = [];
    
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

      // Find earliest service time
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

      // Check if this plan has events for tomorrow
      let hasTomorrowEvent = false;
      for (const member of teamMembers) {
        if (member.rawStartTime) {
          const serviceTime = new Date(member.rawStartTime);
          if (!Number.isNaN(serviceTime.getTime())) {
            const memberDate = startOfDay(serviceTime);
            const memberDateKey = format(memberDate, 'yyyy-MM-dd');
            if (memberDateKey === tomorrowDateKey) {
              hasTomorrowEvent = true;
              break;
            }
          }
        }
      }
      
      if (!hasTomorrowEvent) {
        for (const np of neededPositions) {
          if (np.rawStartTime) {
            const serviceTime = new Date(np.rawStartTime);
            if (!Number.isNaN(serviceTime.getTime())) {
              const npDate = startOfDay(serviceTime);
              const npDateKey = format(npDate, 'yyyy-MM-dd');
              if (npDateKey === tomorrowDateKey) {
                hasTomorrowEvent = true;
                break;
              }
            }
          }
        }
      }

      if (hasTomorrowEvent && earliestTime && earliestTime > now) {
        tomorrowEvents.push({
          plan,
          earliestTime,
          teamMembers,
          neededPositions,
        });
      }
    }

    if (tomorrowEvents.length === 0) {
      console.log('No events found for tomorrow.');
      return;
    }

    console.log(`Found ${tomorrowEvents.length} event(s) for tomorrow\n`);

    // Find the earliest time across all tomorrow events
    let earliestTimeForDate = null;
    for (const event of tomorrowEvents) {
      if (!earliestTimeForDate || event.earliestTime.getTime() < earliestTimeForDate.getTime()) {
        earliestTimeForDate = event.earliestTime;
      }
    }

    console.log(`Earliest service time: ${formatServiceTime(earliestTimeForDate)} on ${formatDisplayDate(earliestTimeForDate)}\n`);

    // Get the date of the event at midnight local time
    const eventDate = startOfDay(earliestTimeForDate);
    const eventDateKey = format(eventDate, 'yyyy-MM-dd');
    
    // Combine all team members and needed positions from all events on this date
    // Filter to only include those that match the target date (same as index.js)
    const allTeamMembers = [];
    const allNeededPositions = [];
    
    for (const event of tomorrowEvents) {
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

    // Convert rawStartTime strings to Date instances (same as index.js)
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

    // Normalize needed positions with service times (same as index.js)
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

    console.log('=== FORMATTED MESSAGE (same as index.js would produce) ===');
    console.log(text);
    console.log('\n=== END OF MESSAGE ===\n');

    console.log('Posting to GroupMe (respects DRY_RUN setting)...\n');
    await postMessage(text);
    console.log('✅ Done!');
  } catch (err) {
    console.error('Error:', err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  testIndexNow();
}

module.exports = { testIndexNow };

