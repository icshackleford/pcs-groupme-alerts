## Planning Center → GroupMe Schedule Bot

This bot fetches the upcoming Sunday schedule from Planning Center Services and posts Security and Medical team assignments to a GroupMe channel on a weekly schedule.

### Setup

- Install dependencies:
  - `npm install`
- Create a `.env` file next to `package.json` with:
  - `PCO_APP_ID`
  - `PCO_SECRET`
  - `PCO_SERVICE_TYPE_ID`
  - `GROUPME_BOT_ID`
  - `GROUPME_ACCESS_TOKEN`
  - `GROUPME_GROUP_ID`
  - `TEAM_NAMES` (e.g. `Security,Medical`)
  - Optional: `DRY_RUN=true` to log, not post, to GroupMe.

### Running

- Single run for debugging:
  - `npm run test-run`
  - or `npm run run-once`
- Cron-style weekly schedule (every Monday at 8 AM server time):
  - `npm start`

Deploy this app to Railway and ensure the process is kept running (or wire Railway cron to hit `npm run run-once` weekly).


