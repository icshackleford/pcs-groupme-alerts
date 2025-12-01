const { getTomorrow, formatDisplayDate, formatServiceTime } = require('./utils.date');
const config = require('./config');
const {
  getPlansForWeekRange,
  getTeamMembersForPlan,
} = require('./services.planningCenter');
const { postMessage, formatScheduleMessage } = require('./services.groupMe');
const cron = require('node-cron');

async function runOnce() {
  console.log('Running Planning Center → GroupMe bot once...');
  try {
    const tomorrow = getTomorrow();
    const displayDate = formatDisplayDate(tomorrow);
    console.log(`Tomorrow resolved to: ${displayDate}`);

    // Fetch all plans for tomorrow
    const plans = await getPlansForWeekRange(
      config.planningCenter.serviceTypeId,
      tomorrow,
      tomorrow
    );

    if (!plans || plans.length === 0) {
      console.log('No plans found for tomorrow.');
      // Don't post if there are no plans - just log
      return;
    }

    console.log(`Found ${plans.length} plan(s) for tomorrow:`, plans.map(p => `${p.id} (${p.attributes && p.attributes.dates})`).join(', '));

    // Fetch team members from all plans for tomorrow
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
      console.log('No Security/Medical team members found for tomorrow.');
      // Don't post if there are no team members - just log
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

    console.log('Formatted message:\n', text);
    await postMessage(text);
  } catch (err) {
    console.error('Error running bot:', err.message || err);
  }
}

function startCron() {
  // Every day at 08:00 server local time (posts tomorrow's schedule)
  const expression = '0 8 * * *';
  console.log(`Scheduling daily job with cron: "${expression}"`);
  cron.schedule(expression, () => {
    console.log('Cron trigger: running daily bot job...');
    runOnce();
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--once')) {
    runOnce();
  } else {
    startCron();
    console.log('Bot is running and will check for tomorrow\'s schedule daily at 8:00 AM server time.');
    console.log('Process will stay alive to execute scheduled jobs.');
    // Also allow immediate run on startup for easier debugging if desired:
    // runOnce();
  }
}

module.exports = {
  runOnce,
  startCron,
};


