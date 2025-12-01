const axios = require('axios');
const config = require('./config');
const { formatDisplayDate } = require('./utils.date');

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

function toBoldUnicode(text) {
  // Convert regular text to Unicode Mathematical Bold
  const boldMap = {
    '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗',
    'A': '𝐀', 'B': '𝐁', 'C': '𝐂', 'D': '𝐃', 'E': '𝐄', 'F': '𝐅', 'G': '𝐆', 'H': '𝐇', 'I': '𝐈', 'J': '𝐉',
    'K': '𝐊', 'L': '𝐋', 'M': '𝐌', 'N': '𝐍', 'O': '𝐎', 'P': '𝐏', 'Q': '𝐐', 'R': '𝐑', 'S': '𝐒', 'T': '𝐓',
    'U': '𝐔', 'V': '𝐕', 'W': '𝐖', 'X': '𝐗', 'Y': '𝐘', 'Z': '𝐙',
    'a': '𝐚', 'b': '𝐛', 'c': '𝐜', 'd': '𝐝', 'e': '𝐞', 'f': '𝐟', 'g': '𝐠', 'h': '𝐡', 'i': '𝐢', 'j': '𝐣',
    'k': '𝐤', 'l': '𝐥', 'm': '𝐦', 'n': '𝐧', 'o': '𝐨', 'p': '𝐩', 'q': '𝐪', 'r': '𝐫', 's': '𝐬', 't': '𝐭',
    'u': '𝐮', 'v': '𝐯', 'w': '𝐰', 'x': '𝐱', 'y': '𝐲', 'z': '𝐳',
    ',': ',', ' ': ' '
  };
  
  return text.split('').map(char => boldMap[char] || char).join('');
}

function getSundayDateKey(serviceTime) {
  if (!serviceTime) return null;
  const date = new Date(serviceTime);
  if (isNaN(date.getTime())) return null;
  
  // Get the date at midnight to use as a key
  const dateKey = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return dateKey.toISOString().split('T')[0]; // YYYY-MM-DD format
}

function formatScheduleMessage(members, targetDate, formatTimeFn) {
  // Get the target date key (YYYY-MM-DD format)
  const targetDateKey = targetDate instanceof Date && !Number.isNaN(targetDate.getTime())
    ? targetDate.toISOString().split('T')[0]
    : null;
  
  // Group members by date, filtering to only include the target date
  const byDate = {};
  for (const m of members) {
    const dateKey = getSundayDateKey(m.serviceTime);

    // Only keep members scheduled for the target date
    if (targetDateKey && dateKey) {
      if (dateKey !== targetDateKey) {
        continue; // Skip dates that don't match the target date
      }
    }
    if (!dateKey) {
      // Skip members without service times
      continue;
    }
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(m);
  }

  const lines = [];

  function pushLine(line) {
    lines.push(line);
  }

  // Only show dates that have assignments (skip empty days)
  const datesToShow = Object.keys(byDate).sort();
  
  // Process each date that has assignments
  for (const dateKey of datesToShow) {
    const dateMembers = byDate[dateKey];
    
    // Skip if no members for this date (shouldn't happen, but safety check)
    if (!dateMembers || dateMembers.length === 0) {
      continue;
    }
    
    // Format the date header with bold Unicode (no separators)
    if (dateKey === 'TBD') {
      pushLine(`🗓️ ${toBoldUnicode('TBD Dates')}`);
    } else {
      const dateObj = new Date(dateKey + 'T00:00:00');
      const dateHeader = formatDisplayDate(dateObj);
      pushLine(`🗓️ ${toBoldUnicode(dateHeader)}`);
    }
    pushLine(''); // Blank line after date header

    // Group by team for this date
    const medicalTeam = [];
    const securityTeam = [];
    const otherTeams = {};

    for (const m of dateMembers) {
      const teamName = (m.teamName || '').toLowerCase();
      if (teamName.includes('medical')) {
        medicalTeam.push(m);
      } else if (teamName.includes('security')) {
        securityTeam.push(m);
      } else {
        if (!otherTeams[m.teamName]) otherTeams[m.teamName] = [];
        otherTeams[m.teamName].push(m);
      }
    }

    // Sort each team by service time (lowest to highest)
    function sortByTime(a, b) {
      if (!a.serviceTime && !b.serviceTime) return 0;
      if (!a.serviceTime) return 1; // TBD goes to end
      if (!b.serviceTime) return -1;
      return a.serviceTime.getTime() - b.serviceTime.getTime();
    }

    medicalTeam.sort(sortByTime);
    securityTeam.sort(sortByTime);
    for (const teamName in otherTeams) {
      otherTeams[teamName].sort(sortByTime);
    }

    // Helper to add a member line
    function addMemberLine(teamLabel, member) {
      const timeText = member.serviceTime ? formatTimeFn(member.serviceTime) : 'TBD';
      const emoji = statusToEmoji(member.status);
      const displayName = member.personName || 'Unknown';
      const line = `- ${displayName} - ${member.positionName} - ${timeText} ${emoji}`;
      pushLine(line);
    }

    // Helper to add an open position line with sign-up link (compact format)
    function addOpenPositionLine(member, signUpUrl) {
      const timeText = member.serviceTime ? formatTimeFn(member.serviceTime) : 'TBD';
      // Compact format: "Open: Position @ Time [URL]"
      if (signUpUrl) {
        const line = `Open: ${member.positionName} @ ${timeText} ${signUpUrl}`;
        pushLine(line);
      } else {
        const line = `Open: ${member.positionName} @ ${timeText}`;
        pushLine(line);
      }
    }

    // Format Medical team (filter out declined)
    const medicalConfirmed = medicalTeam.filter(m => m.status !== 'declined');
    const medicalDeclined = medicalTeam.filter(m => m.status === 'declined');
    
    if (medicalConfirmed.length > 0 || medicalDeclined.length > 0) {
      pushLine('🏥 MEDICAL RESPONSE TEAM:');
      for (const m of medicalConfirmed) {
        addMemberLine('medical', m);
      }
      // Show open positions as line items with sign-up links
      if (medicalDeclined.length > 0) {
        const signUpUrl = config.teams.signUpUrls['medical'] || 
                         config.teams.signUpUrls['medical response'] || 
                         config.teams.signUpUrls.defaultSignUpUrl || '';
        // Sort declined positions by time
        const sortedDeclined = [...medicalDeclined].sort((a, b) => {
          if (!a.serviceTime && !b.serviceTime) return 0;
          if (!a.serviceTime) return 1;
          if (!b.serviceTime) return -1;
          return a.serviceTime.getTime() - b.serviceTime.getTime();
        });
        for (const m of sortedDeclined) {
          addOpenPositionLine(m, signUpUrl);
        }
      }
      pushLine(''); // Blank line after Medical team
    }

    // Format Security team (filter out declined)
    const securityConfirmed = securityTeam.filter(m => m.status !== 'declined');
    const securityDeclined = securityTeam.filter(m => m.status === 'declined');
    
    if (securityConfirmed.length > 0 || securityDeclined.length > 0) {
      pushLine('👮 SECURITY RESPONSE TEAM:');
      for (const m of securityConfirmed) {
        addMemberLine('security', m);
      }
      // Show open positions as line items with sign-up links
      if (securityDeclined.length > 0) {
        const signUpUrl = config.teams.signUpUrls['security'] || 
                         config.teams.signUpUrls['security response'] || 
                         config.teams.signUpUrls.defaultSignUpUrl || '';
        // Sort declined positions by time
        const sortedDeclined = [...securityDeclined].sort((a, b) => {
          if (!a.serviceTime && !b.serviceTime) return 0;
          if (!a.serviceTime) return 1;
          if (!b.serviceTime) return -1;
          return a.serviceTime.getTime() - b.serviceTime.getTime();
        });
        for (const m of sortedDeclined) {
          addOpenPositionLine(m, signUpUrl);
        }
      }
      pushLine(''); // Blank line after Security team
    }

    // Format other teams (if any) - filter out declined
    for (const teamName in otherTeams) {
      const teamMembers = otherTeams[teamName];
      const confirmed = teamMembers.filter(m => m.status !== 'declined');
      const declined = teamMembers.filter(m => m.status === 'declined');
      
      if (confirmed.length > 0 || declined.length > 0) {
        pushLine(`👥 ${teamName.toUpperCase()}:`);
        for (const m of confirmed) {
          addMemberLine(teamName, m);
        }
        
        if (declined.length > 0) {
          const teamKey = teamName.toLowerCase();
          const signUpUrl = config.teams.signUpUrls[teamKey] || 
                           config.teams.signUpUrls.defaultSignUpUrl || '';
          // Sort declined positions by time
          const sortedDeclined = [...declined].sort((a, b) => {
            if (!a.serviceTime && !b.serviceTime) return 0;
            if (!a.serviceTime) return 1;
            if (!b.serviceTime) return -1;
            return a.serviceTime.getTime() - b.serviceTime.getTime();
          });
          for (const m of sortedDeclined) {
            addOpenPositionLine(m, signUpUrl);
          }
        }
        pushLine(''); // Blank line after other teams
      }
    }
  }

  pushLine(''); // Blank line before legend
  pushLine('✅ = Confirmed | ⏳ = Pending');

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


