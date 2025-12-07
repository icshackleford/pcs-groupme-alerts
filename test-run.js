const { getTomorrow, formatDisplayDate, formatServiceTime } = require('./utils.date');
const config = require('./config');
const {
  getPlansForWeekRange,
  getTeamMembersForPlan,
  getNeededPositions,
} = require('./services.planningCenter');
const { postMessage, formatScheduleMessage } = require('./services.groupMe');

async function testForSunday() {
  console.log('Running Planning Center → GroupMe bot test for Sunday...');
  try {
    // Simulate running on Saturday, so "tomorrow" is Sunday
    const saturday = new Date();
    saturday.setDate(saturday.getDate() + (6 - saturday.getDay())); // Get next Saturday
    if (saturday.getDay() !== 6) {
      saturday.setDate(saturday.getDate() - 7); // If we went past, go back a week
    }
    
    const tomorrow = getTomorrow(saturday); // This will be Sunday
    const displayDate = formatDisplayDate(tomorrow);
    console.log(`Simulating Saturday ${formatDisplayDate(saturday)}, so tomorrow is: ${displayDate}`);

    // Fetch all plans for tomorrow (Sunday)
    const plans = await getPlansForWeekRange(
      config.planningCenter.serviceTypeId,
      tomorrow,
      tomorrow
    );

    if (!plans || plans.length === 0) {
      console.log('No plans found for Sunday.');
      return;
    }

    console.log(`Found ${plans.length} plan(s) for Sunday:`, plans.map(p => `${p.id} (${p.attributes && p.attributes.dates})`).join(', '));

    // Fetch team members and needed positions from all plans for Sunday
    const allTeamMembers = [];
    const allNeededPositions = [];
    for (const plan of plans) {
      const teamMembers = await getTeamMembersForPlan(
        config.planningCenter.serviceTypeId,
        plan.id,
        config.teams.names
      );
      if (teamMembers && teamMembers.length > 0) {
        allTeamMembers.push(...teamMembers);
      }
      
      const neededPositions = await getNeededPositions(
        config.planningCenter.serviceTypeId,
        plan.id
      );
      if (neededPositions && neededPositions.length > 0) {
        allNeededPositions.push(...neededPositions);
      }
    }

    if (allTeamMembers.length === 0) {
      console.log('No Security/Medical team members found for Sunday.');
      return;
    }

    // Convert rawStartTime strings to Date instances if present
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
      tomorrow,
      formatServiceTime,
      normalizedNeededPositions
    );

    console.log('\nFormatted message:\n', text);
    await postMessage(text);
  } catch (err) {
    console.error('Error running test:', err.message || err);
    throw err;
  }
}

async function main() {
  try {
    await testForSunday();
  } catch (err) {
    console.error('Test run failed:', err);
    process.exit(1);
  }
}

main();


