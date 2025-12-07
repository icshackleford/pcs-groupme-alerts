const { formatDisplayDate, formatServiceTime } = require('./utils.date');
const { addDays, format, startOfDay } = require('date-fns');
const config = require('./config');
const {
  getPlansForWeekRange,
  getTeamMembersForPlan,
  getNeededPositions,
} = require('./services.planningCenter');
const { formatScheduleMessage } = require('./services.groupMe');

async function testProdTomorrow() {
  console.log('=== PRODUCTION TEST FOR TOMORROW ===');
  console.log('Fetching tomorrow\'s events...\n');
  
  const now = new Date();
  const tomorrow = addDays(now, 1);
  const tomorrowStart = startOfDay(tomorrow);
  const tomorrowEnd = addDays(tomorrowStart, 1);
  
  console.log(`Looking for events on: ${formatDisplayDate(tomorrowStart)}\n`);
  
  // Fetch all plans in the next 7 days
  const plans = await getPlansForWeekRange(
    config.planningCenter.serviceTypeId,
    now,
    addDays(now, 7)
  );

  if (!plans || plans.length === 0) {
    console.log('No upcoming events found.');
    return;
  }

  console.log(`Found ${plans.length} plan(s) in the next 7 days\n`);

  // Find plans that have events tomorrow
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

    // Check if any members or needed positions are for tomorrow
    let hasTomorrowEvent = false;
    let earliestTime = null;
    
    for (const member of teamMembers) {
      if (member.rawStartTime) {
        const serviceTime = new Date(member.rawStartTime);
        if (!Number.isNaN(serviceTime.getTime())) {
          const memberDate = startOfDay(serviceTime);
          const memberDateKey = format(memberDate, 'yyyy-MM-dd');
          const tomorrowDateKey = format(tomorrowStart, 'yyyy-MM-dd');
          
          console.log(`  Member: ${member.personName || 'Unknown'} - Raw time: ${member.rawStartTime}`);
          console.log(`    Parsed Date: ${serviceTime.toISOString()}`);
          console.log(`    Local Date Key: ${memberDateKey}`);
          console.log(`    Tomorrow Date Key: ${tomorrowDateKey}`);
          console.log(`    Match: ${memberDateKey === tomorrowDateKey}`);
          
          if (memberDateKey === tomorrowDateKey) {
            hasTomorrowEvent = true;
            if (!earliestTime || serviceTime.getTime() < earliestTime.getTime()) {
              earliestTime = serviceTime;
            }
          }
        }
      }
    }

    for (const np of neededPositions) {
      if (np.rawStartTime) {
        const serviceTime = new Date(np.rawStartTime);
        if (!Number.isNaN(serviceTime.getTime())) {
          const npDate = startOfDay(serviceTime);
          const npDateKey = format(npDate, 'yyyy-MM-dd');
          const tomorrowDateKey = format(tomorrowStart, 'yyyy-MM-dd');
          
          if (npDateKey === tomorrowDateKey) {
            hasTomorrowEvent = true;
            if (!earliestTime || serviceTime.getTime() < earliestTime.getTime()) {
              earliestTime = serviceTime;
            }
          }
        }
      }
    }

    if (hasTomorrowEvent) {
      tomorrowEvents.push({
        plan,
        earliestTime,
        teamMembers,
        neededPositions,
      });
    }
  }

  if (tomorrowEvents.length === 0) {
    console.log('\nNo events found for tomorrow.');
    return;
  }

  console.log(`\nFound ${tomorrowEvents.length} event(s) for tomorrow\n`);

  // Combine all team members and needed positions from all tomorrow events
  // Filter to only include those that are actually for tomorrow
  const allTeamMembers = [];
  const allNeededPositions = [];
  const tomorrowDateKey = format(tomorrowStart, 'yyyy-MM-dd');
  
  for (const event of tomorrowEvents) {
    // Filter team members to only those for tomorrow
    for (const member of event.teamMembers) {
      if (member.rawStartTime) {
        const serviceTime = new Date(member.rawStartTime);
        if (!Number.isNaN(serviceTime.getTime())) {
          const memberDate = startOfDay(serviceTime);
          const memberDateKey = format(memberDate, 'yyyy-MM-dd');
          if (memberDateKey === tomorrowDateKey) {
            allTeamMembers.push(member);
          }
        }
      }
    }
    
    // Filter needed positions to only those for tomorrow
    for (const np of event.neededPositions) {
      if (np.rawStartTime) {
        const serviceTime = new Date(np.rawStartTime);
        if (!Number.isNaN(serviceTime.getTime())) {
          const npDate = startOfDay(serviceTime);
          const npDateKey = format(npDate, 'yyyy-MM-dd');
          if (npDateKey === tomorrowDateKey) {
            allNeededPositions.push(np);
          }
        }
      }
    }
  }

  // Find the earliest time across all tomorrow events
  let earliestTimeForDate = null;
  for (const event of tomorrowEvents) {
    if (!earliestTimeForDate || event.earliestTime.getTime() < earliestTimeForDate.getTime()) {
      earliestTimeForDate = event.earliestTime;
    }
  }

  console.log(`Earliest service time: ${earliestTimeForDate.toISOString()}`);
  console.log(`  Local time: ${formatServiceTime(earliestTimeForDate)}`);
  console.log(`  Date: ${formatDisplayDate(earliestTimeForDate)}\n`);

  // Get the date of the event at midnight local time
  const eventDate = startOfDay(earliestTimeForDate);
  console.log(`Event date (startOfDay): ${eventDate.toISOString()}`);
  console.log(`Event date key: ${format(eventDate, 'yyyy-MM-dd')}\n`);

  // Convert rawStartTime strings to Date instances
  console.log('Normalizing team members...');
  const normalizedForFormatting = allTeamMembers.map((m) => {
    let serviceTime = null;
    if (m.rawStartTime) {
      const parsed = new Date(m.rawStartTime);
      if (!Number.isNaN(parsed.getTime())) {
        serviceTime = parsed;
        console.log(`  ${m.personName || 'Unknown'}: ${m.rawStartTime} -> ${serviceTime.toISOString()} -> ${formatServiceTime(serviceTime)}`);
      }
    }
    return {
      ...m,
      serviceTime,
    };
  });

  // Normalize needed positions with service times
  console.log('\nNormalizing needed positions...');
  const normalizedNeededPositions = allNeededPositions.map((np) => {
    let serviceTime = null;
    if (np.rawStartTime) {
      const parsed = new Date(np.rawStartTime);
      if (!Number.isNaN(parsed.getTime())) {
        serviceTime = parsed;
        console.log(`  ${np.teamName || 'Unknown'} ${np.positionName || ''}: ${np.rawStartTime} -> ${serviceTime.toISOString()} -> ${formatServiceTime(serviceTime)}`);
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

  console.log('\n=== PRODUCTION MESSAGE (what would be posted) ===');
  console.log(text);
  console.log('\n=== END OF MESSAGE ===\n');
}

if (require.main === module) {
  testProdTomorrow().catch((err) => {
    console.error('Error:', err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { testProdTomorrow };

