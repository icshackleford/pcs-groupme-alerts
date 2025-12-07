const { formatDisplayDate, formatServiceTime } = require('./utils.date');
const { addDays, format, startOfDay } = require('date-fns');
const config = require('./config');
const {
  getPlansForWeekRange,
  getTeamMembersForPlan,
  getNeededPositions,
} = require('./services.planningCenter');
const { postMessage, formatScheduleMessage } = require('./services.groupMe');

async function testDryRun() {
  console.log('=== DRY RUN TEST ===');
  console.log('Fetching upcoming events...\n');
  
  const now = new Date();
  const lookAheadDays = 7;
  const endDate = addDays(now, lookAheadDays);
  
  // Fetch all plans in the next 7 days
  const plans = await getPlansForWeekRange(
    config.planningCenter.serviceTypeId,
    now,
    endDate
  );

  if (!plans || plans.length === 0) {
    console.log('No upcoming events found in the next 7 days.');
    return;
  }

  console.log(`Found ${plans.length} plan(s)\n`);

  // Get the first plan and show what the message would look like
  const plan = plans[0];
  console.log(`Testing with plan: ${plan.attributes.name || plan.id}\n`);

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

  if (!earliestTime) {
    console.log('No service times found for this plan.');
    return;
  }

  console.log(`Earliest service time: ${formatServiceTime(earliestTime)} on ${formatDisplayDate(earliestTime)}\n`);

  // Get the date of the event at midnight local time
  const eventDate = startOfDay(earliestTime);

  // Convert rawStartTime strings to Date instances
  const normalizedForFormatting = teamMembers.map((m) => {
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
  const normalizedNeededPositions = neededPositions.map((np) => {
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

  console.log('=== FORMATTED MESSAGE (DRY RUN) ===');
  console.log(text);
  console.log('\n=== END OF MESSAGE ===\n');

  // Actually call postMessage (which will respect DRY_RUN flag)
  console.log('Calling postMessage (will respect DRY_RUN setting)...\n');
  await postMessage(text);
}

if (require.main === module) {
  testDryRun().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

module.exports = { testDryRun };

