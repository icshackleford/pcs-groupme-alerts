const axios = require('axios');
const config = require('./config');

const groupMeClient = axios.create({
  baseURL: config.groupMe.baseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

function statusToEmoji(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'confirmed') return '✅';
  if (s === 'declined') return '❌';
  return '⏳';
}

function groupByTeam(members, teamNames) {
  const grouped = {};
  for (const name of teamNames) {
    grouped[name] = [];
  }
  for (const m of members) {
    if (!grouped[m.teamName]) {
      grouped[m.teamName] = [];
    }
    grouped[m.teamName].push(m);
  }
  return grouped;
}

function formatScheduleMessage(members, displayDate, formatTimeFn) {
  const header = `🗓️ Service Schedule for ${displayDate}`;

  const grouped = groupByTeam(members, config.teams.names);

  const lines = [header, ''];

  for (const teamName of config.teams.names) {
    const teamMembers = grouped[teamName] || [];
    const icon = teamName.toLowerCase().includes('security')
      ? '👮'
      : teamName.toLowerCase().includes('medical')
      ? '🏥'
      : '👥';
    lines.push(`${icon} ${teamName.toUpperCase()} TEAM:`);

    if (teamMembers.length === 0) {
      lines.push('- No assignments scheduled.');
      lines.push(''); // blank line after section
      continue;
    }

    for (const m of teamMembers) {
      const timeText = m.serviceTime
        ? formatTimeFn(m.serviceTime)
        : 'TBD';
      const emoji = statusToEmoji(m.status);
      lines.push(
        `- ${m.personName} - ${m.positionName} - ${timeText} ${emoji}`
      );
    }

    lines.push(''); // blank line after each team section
  }

  lines.push('✅ = Confirmed | ⏳ = Pending | ❌ = Declined');

  return lines.join('\n');
}

async function postMessage(text, pictureUrl) {
  if (config.flags.dryRun) {
    console.log('[DRY_RUN] Would post to GroupMe:\n', text);
    return;
  }

  const payload = {
    bot_id: config.groupMe.botId,
    text,
  };
  if (pictureUrl) {
    payload.picture_url = pictureUrl;
  }

  const resp = await groupMeClient.post('/bots/post', payload, {
    params: {
      token: config.groupMe.accessToken,
    },
  });

  if (resp.status !== 202) {
    console.warn(
      `Unexpected GroupMe response status: ${resp.status}`,
      resp.data
    );
  }
}

module.exports = {
  postMessage,
  formatScheduleMessage,
};


