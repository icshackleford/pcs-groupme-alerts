// Override DRY_RUN to post live
process.env.DRY_RUN = 'false';

const { getTomorrow, formatDisplayDate, formatServiceTime } = require('./utils.date');
const config = require('./config');
const {
  getPlansForWeekRange,
  getTeamMembersForPlan,
} = require('./services.planningCenter');
const { postMessage, formatScheduleMessage } = require('./services.groupMe');

async function postSundayLive() {
  console.log('Posting Sunday schedule LIVE to GroupMe...');
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

    // Fetch team members from all plans for Sunday
    const allTeamMembers = [];
    for (const plan of plans) {
      const teamMembers = await getTeamMembersForPlan(
        config.planningCenter.serviceTypeId,
        plan.id,
        config.teams.names
      );
      if (teamMembers && teamMembers.length > 0) {
        allTeamMembers.push(...teamMembers);
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

    const text = formatScheduleMessage(
      normalizedForFormatting,
      tomorrow,
      formatServiceTime
    );

    console.log('\nPosting LIVE message to GroupMe...\n');
    console.log('Formatted message:\n', text);
    await postMessage(text);
    console.log('\n✅ Message posted successfully to GroupMe!');
  } catch (err) {
    console.error('Error posting message:', err.message || err);
    throw err;
  }
}

postSundayLive().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});

