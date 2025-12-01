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

function normalizeTeamMember(raw, includedIndex) {
  const attrs = raw.attributes || {};
  const rels = raw.relationships || {};

  const personId = rels.person && rels.person.data && rels.person.data.id;
  const teamId = rels.team && rels.team.data && rels.team.data.id;
  const positionId =
    rels.position && rels.position.data && rels.position.data.id;

  const person =
    (personId && includedIndex[`Person:${personId}`]) || {};
  const team = (teamId && includedIndex[`Team:${teamId}`]) || {};
  const position =
    (positionId && includedIndex[`Position:${positionId}`]) || {};

  // Service time may not be directly on team_member; fall back to plan time if needed.
  const timeAttr =
    attrs.starts_at ||
    attrs.start_time ||
    person.starts_at ||
    null;

  return {
    id: raw.id,
    status: attrs.status || 'unknown',
    personName:
      (person.attributes && person.attributes.name) ||
      (person.attributes &&
        `${person.attributes.first_name} ${person.attributes.last_name}`) ||
      'Unknown Person',
    teamName:
      (team.attributes && team.attributes.name) || 'Unknown Team',
    positionName:
      (position.attributes && position.attributes.name) ||
      attrs.title ||
      'Unknown Position',
    rawStartTime: timeAttr,
  };
}

async function getTeamMembersForPlan(serviceTypeId, planId, teamNamesFilter) {
  const url = `/service_types/${serviceTypeId}/plans/${planId}/team_members?include=person,team,position`;
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

  const normalized = allData.map((item) =>
    normalizeTeamMember(item, includedIndex)
  );

  const filtered = normalized.filter((m) =>
    teamNamesFilter.includes(m.teamName)
  );

  return filtered;
}

function capitalizeType(type) {
  if (!type) return '';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

module.exports = {
  getServiceTypes,
  getPlansForDate,
  getTeamMembersForPlan,
};


