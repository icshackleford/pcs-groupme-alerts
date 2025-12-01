const axios = require('axios');
const { formatISO, startOfDay, endOfDay } = require('date-fns');
const config = require('./config');

const pcoClient = axios.create({
  baseURL: config.planningCenter.baseUrl,
  auth: {
    username: config.planningCenter.appId,
    password: config.planningCenter.secret,
  },
  headers: {
    Accept: 'application/json',
  },
});

async function requestWithRetry(url, options = {}, retries = 3) {
  try {
    const response = await pcoClient.request({ url, ...options });
    return response.data;
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 401 || status === 403) {
      throw new Error(
        `Planning Center auth error (${status}). Check PCO_APP_ID/PCO_SECRET.`
      );
    }
    if (status === 429 && retries > 0) {
      const retryAfter =
        (err.response.headers && Number(err.response.headers['retry-after'])) ||
        2;
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfter * 1000)
      );
      return requestWithRetry(url, options, retries - 1);
    }
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return requestWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

async function getServiceTypes() {
  const data = await requestWithRetry('/service_types');
  return data.data || [];
}

async function getPlansForDate(serviceTypeId, targetDate) {
  const start = startOfDay(targetDate);
  const end = endOfDay(targetDate);

  const after = formatISO(start);
  const before = formatISO(end);

  const data = await requestWithRetry(
    `/service_types/${serviceTypeId}/plans?filter=after,before&after=${encodeURIComponent(
      after
    )}&before=${encodeURIComponent(before)}`
  );

  const plans = data.data || [];
  if (plans.length === 0) {
    return null;
  }

  // Choose the first plan for that date
  return plans[0];
}

async function getPlansForWeekRange(serviceTypeId, mondayDate, sundayDate) {
  const start = startOfDay(mondayDate);
  const end = endOfDay(sundayDate);

  const after = formatISO(start);
  const before = formatISO(end);

  const data = await requestWithRetry(
    `/service_types/${serviceTypeId}/plans?filter=after,before&after=${encodeURIComponent(
      after
    )}&before=${encodeURIComponent(before)}`
  );

  return data.data || [];
}

async function getAllTeamMembersPages(initialUrl) {
  let url = initialUrl;
  const all = [];

  // Follow JSON:API pagination via links.next
  // initialUrl is relative (e.g., `/service_types/...`)
  while (url) {
    const pageData = await requestWithRetry(url);
    if (Array.isArray(pageData.data)) {
      all.push(...pageData.data);
    }
    const nextLink =
      pageData.links && (pageData.links.next || pageData.links['next']);
    if (nextLink && nextLink.href) {
      // Planning Center may return absolute URLs in links
      const href = nextLink.href;
      if (href.startsWith(config.planningCenter.baseUrl)) {
        url = href.slice(config.planningCenter.baseUrl.length);
      } else {
        url = href;
      }
    } else {
      url = null;
    }
  }

  return all;
}

async function getPlanTimes(serviceTypeId, planId) {
  const url = `/service_types/${serviceTypeId}/plans/${planId}/times`;
  try {
    const data = await requestWithRetry(url);
    const times = data.data || [];

    const index = {};
    for (const t of times) {
      if (!t.id) continue;
      index[t.id] = t;
    }
    return index;
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 404) {
      // Some accounts/plans may not expose times via this endpoint; fall back to TBD.
      return {};
    }
    throw err;
  }
}

function normalizeTeamMember(raw, includedIndex, planTimesIndex) {
  const attrs = raw.attributes || {};
  const rels = raw.relationships || {};

  const personId = rels.person && rels.person.data && rels.person.data.id;
  const teamId = rels.team && rels.team.data && rels.team.data.id;
  
  // Get PlanTime ID from times or service_times relationship
  const timesArray = rels.times && rels.times.data ? rels.times.data : 
                     (rels.service_times && rels.service_times.data ? rels.service_times.data : []);
  const planTimeId = timesArray.length > 0 ? timesArray[0].id : null;

  const person =
    (personId && includedIndex[`Person:${personId}`]) || {};
  const team = (teamId && includedIndex[`Team:${teamId}`]) || {};
  
  // Get PlanTime from included resources OR from planTimesIndex (fetched separately)
  let planTime = null;
  if (planTimeId) {
    planTime = includedIndex[`PlanTime:${planTimeId}`] || 
               (planTimesIndex && planTimesIndex[planTimeId]) || 
               null;
  }

  // Extract time from PlanTime attributes
  let timeAttr = null;
  if (planTime && planTime.attributes) {
    timeAttr = planTime.attributes.starts_at || 
               planTime.attributes.time || 
               null;
  }

  // Map status codes: "C" = confirmed, "D" = declined, etc.
  let status = attrs.status || 'unknown';
  if (status === 'C') status = 'confirmed';
  else if (status === 'D') status = 'declined';
  else if (status === 'P' || status === 'U') status = 'pending';

  return {
    id: raw.id,
    status: status,
    personName: attrs.name || 
                (person.attributes && person.attributes.name) ||
                (person.attributes &&
                  `${person.attributes.first_name || ''} ${person.attributes.last_name || ''}`.trim()) ||
                'Unknown Person',
    teamName:
      (team.attributes && team.attributes.name) || 'Unknown Team',
    positionName:
      attrs.team_position_name || // This is the correct field!
      'Unknown Position',
    rawStartTime: timeAttr,
  };
}

async function getTeamMembersForPlan(serviceTypeId, planId, teamNamesFilter) {
  // Try including plan_times - if that doesn't work, we'll fetch them separately
  const url = `/service_types/${serviceTypeId}/plans/${planId}/team_members?include=person,team,times,plan_times`;
  const firstPage = await requestWithRetry(url);

  const allData = [...(firstPage.data || [])];
  const included = firstPage.included || [];

  const nextLink =
    firstPage.links && (firstPage.links.next || firstPage.links['next']);
  if (nextLink && nextLink.href) {
    const remaining = await getAllTeamMembersPages(
      nextLink.href.startsWith(config.planningCenter.baseUrl)
        ? nextLink.href.slice(config.planningCenter.baseUrl.length)
        : nextLink.href
    );
    allData.push(...remaining);
  }

  // Build index for included resources
  const includedIndex = {};
  for (const inc of included) {
    if (!inc.type || !inc.id) continue;
    const key = `${capitalizeType(inc.type)}:${inc.id}`;
    includedIndex[key] = inc;
  }
  
  // Collect all unique PlanTime IDs from team member relationships
  const planTimeIds = new Set();
  for (const member of allData) {
    const rels = member.relationships || {};
    const times = rels.times?.data || rels.service_times?.data || [];
    times.forEach(t => planTimeIds.add(t.id));
  }
  
  // Fetch PlanTime resources if not already in included resources
  const includedTypes = [...new Set(included.map(inc => inc.type))];
  const planTimesIndex = {};
  if (planTimeIds.size > 0 && !includedTypes.includes('PlanTime')) {
    // Try fetching all times for the plan and match by ID
    try {
      const allTimesUrl = `/service_types/${serviceTypeId}/plans/${planId}/plan_times`;
      const allTimesData = await requestWithRetry(allTimesUrl);
      if (allTimesData.data && Array.isArray(allTimesData.data)) {
        for (const time of allTimesData.data) {
          if (time.id && planTimeIds.has(time.id)) {
            planTimesIndex[time.id] = time;
          }
        }
      }
    } catch (err) {
      // Try alternative endpoint if plan_times doesn't work
      try {
        const altUrl = `/service_types/${serviceTypeId}/plans/${planId}/times`;
        const altData = await requestWithRetry(altUrl);
        if (altData.data && Array.isArray(altData.data)) {
          for (const time of altData.data) {
            if (time.id && planTimeIds.has(time.id)) {
              planTimesIndex[time.id] = time;
            }
          }
        }
      } catch (err2) {
        // If both endpoints fail, planTimesIndex will remain empty and times will show as TBD
      }
    }
  } else {
    // Use included PlanTime resources if available
    for (const inc of included) {
      if (inc.type === 'PlanTime' && inc.id) {
        planTimesIndex[inc.id] = inc;
      }
    }
  }

  // Normalize team members - if a member has multiple times, create separate records for each
  const normalized = [];
  for (const item of allData) {
    const rels = item.relationships || {};
    const timesArray = rels.times?.data || rels.service_times?.data || [];
    
    if (timesArray.length === 0) {
      // No times - create one record
      normalized.push(normalizeTeamMember(item, includedIndex, planTimesIndex));
    } else {
      // Multiple times - create a separate record for each time
      for (const timeRef of timesArray) {
        // Create a modified item with only this time
        const modifiedItem = {
          ...item,
          relationships: {
            ...item.relationships,
            times: { data: [timeRef] },
            service_times: { data: [timeRef] },
          },
        };
        normalized.push(normalizeTeamMember(modifiedItem, includedIndex, planTimesIndex));
      }
    }
  }

  const loweredFilters = (teamNamesFilter || []).map((t) =>
    String(t || '').toLowerCase()
  );

  const filtered = normalized.filter((m) => {
    const name = String(m.teamName || '').toLowerCase();
    return loweredFilters.some((t) => t && name.includes(t));
  });

  return filtered;
}

async function getNeededPositions(serviceTypeId, planId) {
  // Fetch needed positions for a plan
  const url = `/service_types/${serviceTypeId}/plans/${planId}/needed_positions?include=team,time`;
  try {
    const data = await requestWithRetry(url);
    const neededPositions = data.data || [];
    const included = data.included || [];
    
    // Build index for included resources (teams and times)
    const includedIndex = {};
    for (const inc of included) {
      if (!inc.type || !inc.id) continue;
      const key = `${capitalizeType(inc.type)}:${inc.id}`;
      includedIndex[key] = inc;
    }
    
    // Normalize needed positions
    return neededPositions.map(np => {
      const attrs = np.attributes || {};
      const rels = np.relationships || {};
      
      const teamId = rels.team?.data?.id;
      const timeId = rels.time?.data?.id;
      
      const team = teamId ? includedIndex[`Team:${teamId}`] : null;
      const planTime = timeId ? includedIndex[`PlanTime:${timeId}`] : null;
      
      // Extract time from PlanTime
      let timeAttr = null;
      if (planTime && planTime.attributes) {
        timeAttr = planTime.attributes.starts_at || 
                   planTime.attributes.time || 
                   null;
      }
      
      return {
        id: np.id,
        quantity: attrs.quantity || 1,
        teamPositionName: attrs.team_position_name || 'Unknown Position',
        teamName: (team?.attributes?.name) || 'Unknown Team',
        teamId: teamId,
        planTimeId: timeId,
        rawStartTime: timeAttr,
      };
    });
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 404) {
      // Some plans may not have needed positions endpoint
      return [];
    }
    throw err;
  }
}

function capitalizeType(type) {
  if (!type) return '';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

module.exports = {
  getServiceTypes,
  getPlansForDate,
  getPlansForWeekRange,
  getTeamMembersForPlan,
  getNeededPositions,
};


