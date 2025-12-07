# Cron Job Timing Logic

## Schedule
- **Cron Expression**: `0 * * * *` (runs every hour at :00 in server timezone)
- **Frequency**: Checks every hour if it's time to post
- **Timezone**: All timing calculations use **Eastern Time (America/New_York)**

## Timing Calculation

### Step 1: Convert Current Time to Eastern
```javascript
const now = toZonedTime(new Date(), 'America/New_York');
```

### Step 2: Calculate Post Time (in Eastern Time)
```
postTime = earliestServiceTime (converted to Eastern) - 24 hours
```

### Step 3: Check if We're in the Post Window
```
hoursUntilPost = differenceInHours(postTime, now)

if (hoursUntilPost >= 0 && hoursUntilPost < 1) {
  // POST NOW - We're within 1 hour of the post time (Eastern time)
}
```

## Important Notes

- **All timing calculations use Eastern Time**, regardless of server timezone
- The cron job runs hourly in the server's timezone (often UTC)
- The code converts the current time to Eastern before checking
- This ensures posts happen at the correct Eastern time, even if the server is in UTC

## Example Timeline

**Event**: Sunday, December 7, 2025 at 8:30 AM

**Post Time**: Saturday, December 6, 2025 at 8:30 AM (24 hours before)

**Cron Runs**:
- 8:00 AM Saturday: `hoursUntilPost = 0.5` → ✅ POSTS
- 9:00 AM Saturday: `hoursUntilPost = -0.5` → ❌ Already posted (marked as posted)

## Why the 1-Hour Window?

Since cron runs hourly, we use a 1-hour window to ensure we catch the post time:
- If post time is 8:30 AM, cron at 8:00 AM will see `hoursUntilPost = 0.5` (within window)
- If post time is 8:30 AM, cron at 9:00 AM will see `hoursUntilPost = -0.5` (too late, skip)

## Duplicate Prevention

Events are tracked in `postedEvents` Set to prevent duplicate posts:
- Key format: `date-YYYY-MM-DD`
- Once posted, that date is marked and won't post again

