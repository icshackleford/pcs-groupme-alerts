const { getNextSunday, formatDisplayDate, formatServiceTime } = require('./utils.date');
const config = require('./config');
const {
  getPlansForDate,
  getTeamMembersForPlan,
} = require('./services.planningCenter');
const { postMessage, formatScheduleMessage } = require('./services.groupMe');
const cron = require('node-cron');

async function runOnce() {
  console.log('Running Planning Center → GroupMe bot once...');
  try {
    const nextSunday = getNextSunday();
    const displayDate = formatDisplayDate(nextSunday);
    console.log(`Next Sunday resolved to: ${displayDate}`);

    const plan = await getPlansForDate(
      config.planningCenter.serviceTypeId,
      nextSunday
    );

    if (!plan) {
      console.log('No plan found for next Sunday.');
      const text = `🗓️ Service Schedule for ${displayDate}\n\nNo plan found in Planning Center for this date.`;
      await postMessage(text);
      return;
    }

    console.log(`Using plan: ${plan.id} (${plan.attributes && plan.attributes.dates})`);

    const teamMembers = await getTeamMembersForPlan(
      config.planningCenter.serviceTypeId,
      plan.id,
      config.teams.names
    );

    if (!teamMembers || teamMembers.length === 0) {
      console.log('No Security/Medical team members found for this plan.');
      const text = `🗓️ Service Schedule for ${displayDate}\n\nNo Security or Medical team assignments found for this service.`;
      await postMessage(text);
      return;
    }

    // Convert rawStartTime strings to Date instances if present
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

    const text = formatScheduleMessage(
      normalizedForFormatting,
      displayDate,
      formatServiceTime
    );

    console.log('Formatted message:\n', text);
    await postMessage(text);
  } catch (err) {
    console.error('Error running bot:', err.message || err);
  }
}

function startCron() {
  // Every Monday at 08:00 server local time
  const expression = '0 8 * * 1';
  console.log(`Scheduling weekly job with cron: "${expression}"`);
  cron.schedule(expression, () => {
    console.log('Cron trigger: running weekly bot job...');
    runOnce();
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--once')) {
    runOnce();
  } else {
    startCron();
    // Also allow immediate run on startup for easier debugging if desired:
    // runOnce();
  }
}

module.exports = {
  runOnce,
  startCron,
};


