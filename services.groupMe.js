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

function getSundayDateKey(serviceTime) {
  if (!serviceTime) return null;
  const date = new Date(serviceTime);
  if (isNaN(date.getTime())) return null;
  
  // Get the date at midnight to use as a key
  const dateKey = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return dateKey.toISOString().split('T')[0]; // YYYY-MM-DD format
}

function formatScheduleMessage(members, targetDate, formatTimeFn, neededPositions = []) {
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
  
  // Group needed positions by date and create a lookup by team+time
  const neededByDate = {};
  const neededLookup = {}; // Key: dateKey|teamName|timeKey -> quantity
  for (const np of neededPositions) {
    const dateKey = getSundayDateKey(np.serviceTime);
    if (!dateKey) continue;
    
    // Only include needed positions for the target date
    if (targetDateKey && dateKey !== targetDateKey) {
      continue;
    }
    
    if (!neededByDate[dateKey]) neededByDate[dateKey] = [];
    neededByDate[dateKey].push(np);
    
    // Create lookup key: team name + time
    const timeKey = np.serviceTime ? np.serviceTime.toISOString() : 'TBD';
    const lookupKey = `${dateKey}|${np.teamName}|${timeKey}`;
    neededLookup[lookupKey] = (neededLookup[lookupKey] || 0) + (np.quantity || 1);
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
    
    // Format the date header with plain text (GroupMe will handle formatting)
    if (dateKey === 'TBD') {
      pushLine(`🗓️ TBD Dates`);
    } else {
      const dateObj = new Date(dateKey + 'T00:00:00');
      const dateHeader = formatDisplayDate(dateObj);
      pushLine(`🗓️ ${dateHeader}`);
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
      // Format: Status - Time - Person (removed position)
      const line = `${emoji} - ${timeText} - ${displayName}`;
      pushLine(line);
    }

    // Helper to add an open position line (no URL - URL goes at bottom of team)
    function addOpenPositionLine(member) {
      const timeText = member.serviceTime ? formatTimeFn(member.serviceTime) : 'TBD';
      // Format: Emoji - Time - "Sign Up Available" (matches member format, but with emoji instead of status)
      const line = `⚠️ - ${timeText} - Sign Up Available`;
      pushLine(line);
    }

    // Format Medical team - use needed positions to determine open slots
    const medicalConfirmed = medicalTeam.filter(m => m.status !== 'declined');
    const medicalDeclined = medicalTeam.filter(m => m.status === 'declined');
    
    // Count needed positions and confirmed by time slot
    const medicalNeededByTime = {}; // timeKey -> quantity needed
    const medicalConfirmedByTime = {}; // timeKey -> count confirmed
    
    // Get needed positions for medical team
    const medicalNeeded = neededPositions.filter(np => {
      const teamName = (np.teamName || '').toLowerCase();
      return teamName.includes('medical');
    });
    
    for (const np of medicalNeeded) {
      const npDateKey = getSundayDateKey(np.serviceTime);
      if (npDateKey !== dateKey) continue;
      const timeKey = np.serviceTime ? np.serviceTime.toISOString() : 'TBD';
      medicalNeededByTime[timeKey] = (medicalNeededByTime[timeKey] || 0) + (np.quantity || 1);
    }
    
    // Count confirmed, pending, and declined by time
    const medicalPendingByTime = {};
    const medicalDeclinedByTime = {};
    for (const m of medicalConfirmed) {
      const timeKey = m.serviceTime ? m.serviceTime.toISOString() : 'TBD';
      medicalConfirmedByTime[timeKey] = (medicalConfirmedByTime[timeKey] || 0) + 1;
    }
    for (const m of medicalTeam.filter(m => m.status === 'pending')) {
      const timeKey = m.serviceTime ? m.serviceTime.toISOString() : 'TBD';
      medicalPendingByTime[timeKey] = (medicalPendingByTime[timeKey] || 0) + 1;
    }
    for (const m of medicalDeclined) {
      const timeKey = m.serviceTime ? m.serviceTime.toISOString() : 'TBD';
      medicalDeclinedByTime[timeKey] = (medicalDeclinedByTime[timeKey] || 0) + 1;
    }
    
    // Calculate open positions needed: needed - confirmed
    // ONLY use needed positions from Planning Center - don't infer from declined assignments
    const medicalOpenByTime = {};
    for (const timeKey in medicalNeededByTime) {
      const needed = medicalNeededByTime[timeKey];
      const confirmed = medicalConfirmedByTime[timeKey] || 0;
      const open = needed - confirmed;
      if (open > 0) {
        medicalOpenByTime[timeKey] = open;
      }
    }
    
    if (medicalConfirmed.length > 0 || Object.keys(medicalOpenByTime).length > 0) {
      pushLine('🏥 MEDICAL RESPONSE TEAM:');
      
      // Combine all members and open positions, sort by time
      const allMedical = [
        ...medicalConfirmed.map(m => ({ ...m, isOpen: false, isNeeded: false })),
      ];
      
      // Add open positions based on needed - confirmed
      for (const timeKey in medicalOpenByTime) {
        const openCount = medicalOpenByTime[timeKey];
        const serviceTime = timeKey !== 'TBD' ? new Date(timeKey) : null;
        for (let i = 0; i < openCount; i++) {
          allMedical.push({
            serviceTime,
            isOpen: true,
            isNeeded: true,
          });
        }
      }
      
      allMedical.sort((a, b) => {
        if (!a.serviceTime && !b.serviceTime) return 0;
        if (!a.serviceTime) return 1;
        if (!b.serviceTime) return -1;
        return a.serviceTime.getTime() - b.serviceTime.getTime();
      });
      
      // Display all members and open positions sorted by time
      for (const m of allMedical) {
        if (m.isOpen) {
          addOpenPositionLine(m);
        } else {
          addMemberLine('medical', m);
        }
      }
      
      // Add sign-up URL at bottom of team section if there are open positions
      if (Object.keys(medicalOpenByTime).length > 0) {
        const signUpUrl = config.teams.signUpUrls['medical'] || 
                         config.teams.signUpUrls['medical response'] || 
                         config.teams.signUpUrls.defaultSignUpUrl || '';
        if (signUpUrl) {
          pushLine(`Sign up: ${signUpUrl}`);
        }
      }
      
      pushLine(''); // Blank line after Medical team
    }

    // Format Security team - use needed positions to determine open slots
    const securityConfirmed = securityTeam.filter(m => m.status !== 'declined');
    const securityDeclined = securityTeam.filter(m => m.status === 'declined');
    
    // Count needed positions and confirmed by time slot
    const securityNeededByTime = {}; // timeKey -> quantity needed
    const securityConfirmedByTime = {}; // timeKey -> count confirmed
    
    // Get needed positions for security team
    const securityNeeded = neededPositions.filter(np => {
      const teamName = (np.teamName || '').toLowerCase();
      return teamName.includes('security');
    });
    
    for (const np of securityNeeded) {
      const npDateKey = getSundayDateKey(np.serviceTime);
      if (npDateKey !== dateKey) continue;
      const timeKey = np.serviceTime ? np.serviceTime.toISOString() : 'TBD';
      securityNeededByTime[timeKey] = (securityNeededByTime[timeKey] || 0) + (np.quantity || 1);
    }
    
    // Count confirmed, pending, and declined by time
    const securityPendingByTime = {};
    const securityDeclinedByTime = {};
    for (const m of securityConfirmed) {
      const timeKey = m.serviceTime ? m.serviceTime.toISOString() : 'TBD';
      securityConfirmedByTime[timeKey] = (securityConfirmedByTime[timeKey] || 0) + 1;
    }
    for (const m of securityTeam.filter(m => m.status === 'pending')) {
      const timeKey = m.serviceTime ? m.serviceTime.toISOString() : 'TBD';
      securityPendingByTime[timeKey] = (securityPendingByTime[timeKey] || 0) + 1;
    }
    for (const m of securityDeclined) {
      const timeKey = m.serviceTime ? m.serviceTime.toISOString() : 'TBD';
      securityDeclinedByTime[timeKey] = (securityDeclinedByTime[timeKey] || 0) + 1;
    }
    
    // Calculate open positions needed: needed - confirmed
    // ONLY use needed positions from Planning Center - don't infer from declined assignments
    const securityOpenByTime = {};
    for (const timeKey in securityNeededByTime) {
      const needed = securityNeededByTime[timeKey];
      const confirmed = securityConfirmedByTime[timeKey] || 0;
      const open = needed - confirmed;
      if (open > 0) {
        securityOpenByTime[timeKey] = open;
      }
    }
    
    if (securityConfirmed.length > 0 || Object.keys(securityOpenByTime).length > 0) {
      pushLine('👮 SECURITY RESPONSE TEAM:');
      
      // Combine all members and open positions, sort by time
      const allSecurity = [
        ...securityConfirmed.map(m => ({ ...m, isOpen: false, isNeeded: false })),
      ];
      
      // Add open positions based on needed - confirmed
      for (const timeKey in securityOpenByTime) {
        const openCount = securityOpenByTime[timeKey];
        const serviceTime = timeKey !== 'TBD' ? new Date(timeKey) : null;
        for (let i = 0; i < openCount; i++) {
          allSecurity.push({
            serviceTime,
            isOpen: true,
            isNeeded: true,
          });
        }
      }
      
      allSecurity.sort((a, b) => {
        if (!a.serviceTime && !b.serviceTime) return 0;
        if (!a.serviceTime) return 1;
        if (!b.serviceTime) return -1;
        return a.serviceTime.getTime() - b.serviceTime.getTime();
      });
      
      // Display all members and open positions sorted by time
      for (const m of allSecurity) {
        if (m.isOpen) {
          addOpenPositionLine(m);
        } else {
          addMemberLine('security', m);
        }
      }
      
      // Add sign-up URL at bottom of team section if there are open positions
      if (Object.keys(securityOpenByTime).length > 0) {
        const signUpUrl = config.teams.signUpUrls['security'] || 
                         config.teams.signUpUrls['security response'] || 
                         config.teams.signUpUrls.defaultSignUpUrl || '';
        if (signUpUrl) {
          pushLine(`Sign up: ${signUpUrl}`);
        }
      }
      
      pushLine(''); // Blank line after Security team
    }

    // Format other teams (if any) - combine confirmed and declined, sort by time
    for (const teamName in otherTeams) {
      const teamMembers = otherTeams[teamName];
      const confirmed = teamMembers.filter(m => m.status !== 'declined');
      const declined = teamMembers.filter(m => m.status === 'declined');
      
      if (confirmed.length > 0 || declined.length > 0) {
        pushLine(`👥 ${teamName.toUpperCase()}:`);
        
        // Combine all members (confirmed + declined as open positions) and sort by time
        const allTeamMembers = [
          ...confirmed.map(m => ({ ...m, isOpen: false })),
          ...declined.map(m => ({ ...m, isOpen: true }))
        ].sort((a, b) => {
          if (!a.serviceTime && !b.serviceTime) return 0;
          if (!a.serviceTime) return 1;
          if (!b.serviceTime) return -1;
          return a.serviceTime.getTime() - b.serviceTime.getTime();
        });
        
        // Display all members sorted by time
        for (const m of allTeamMembers) {
          if (m.isOpen) {
            addOpenPositionLine(m);
          } else {
            addMemberLine(teamName, m);
          }
        }
        
        // Add sign-up URL at bottom of team section if there are open positions
        if (declined.length > 0) {
          const teamKey = teamName.toLowerCase();
          const signUpUrl = config.teams.signUpUrls[teamKey] || 
                           config.teams.signUpUrls.defaultSignUpUrl || '';
          if (signUpUrl) {
            pushLine(`Sign up: ${signUpUrl}`);
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


