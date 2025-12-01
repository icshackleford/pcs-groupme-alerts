const dotenv = require('dotenv');

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const TEAM_NAMES = (process.env.TEAM_NAMES || 'Security,Medical')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  planningCenter: {
    appId: requireEnv('PCO_APP_ID'),
    secret: requireEnv('PCO_SECRET'),
    serviceTypeId: requireEnv('PCO_SERVICE_TYPE_ID'),
    baseUrl: 'https://api.planningcenteronline.com/services/v2',
  },
  groupMe: {
    botId: requireEnv('GROUPME_BOT_ID'),
    accessToken: requireEnv('GROUPME_ACCESS_TOKEN'),
    groupId: requireEnv('GROUPME_GROUP_ID'),
    baseUrl: 'https://api.groupme.com/v3',
  },
  teams: {
    names: TEAM_NAMES,
  },
  flags: {
    dryRun: String(process.env.DRY_RUN || '').toLowerCase() === 'true',
  },
};


