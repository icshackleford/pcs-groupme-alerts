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
  - Optional: `MEDICAL_SIGNUP_URL` - URL to Medical team sign-up sheet (auto-generated from service type ID if not provided)
  - Optional: `SECURITY_SIGNUP_URL` - URL to Security team sign-up sheet (auto-generated from service type ID if not provided)
  
  **Note:** By default, sign-up URLs are auto-generated using the pattern:
  `https://services.planningcenteronline.com/ministries/{PCO_SERVICE_TYPE_ID}/signup_sheet`
  
  You can override this by setting `MEDICAL_SIGNUP_URL` or `SECURITY_SIGNUP_URL` if your teams use different sign-up sheets.
  - Optional: `DRY_RUN=true` to log, not post, to GroupMe.

### Running

- Single run for debugging:
  - `npm run test-run`
  - or `npm run run-once`
- Cron-style weekly schedule (every Monday at 8 AM server time):
  - `npm start`

Deploy this app to Railway and ensure the process is kept running (or wire Railway cron to hit `npm run run-once` weekly).


