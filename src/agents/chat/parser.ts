import { chat, MODELS } from '../../config/groq';

export interface ParsedQuery {
  intent: 'summary' | 'comparison' | 'trend' | 'drill_down' | 'list' | 'unknown';
  entity?: 'users' | 'teams' | 'projects' | 'apps' | 'daily_usage' | 'app_usage' | 'classification_rules';
  metrics: string[];
  filters: {
    teams?: string[];
    users?: string[];
    projects?: string[];
    apps?: string[];
    dateRange?: {
      start: string;
      end: string;
    };
    productivityRating?: string[];
  };
  groupBy?: string[];
  orderBy?: string;
  limit?: number;
}

// Helper functions for date calculations
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDateContext(): {
  today: string;
  yesterday: string;
  lastWeekStart: string;
  lastWeekEnd: string;
  thisWeekStart: string;
  lastMonthStart: string;
  lastMonthEnd: string;
  last30Days: string;
  last7Days: string;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Last week (previous Monday to Sunday)
  const lastWeekEnd = new Date(today);
  lastWeekEnd.setDate(today.getDate() - today.getDay()); // Last Sunday
  const lastWeekStart = new Date(lastWeekEnd);
  lastWeekStart.setDate(lastWeekEnd.getDate() - 6); // Previous Monday

  // This week (current Monday to today)
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay() + 1); // Current Monday

  // Last month
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  // Relative days
  const last30Days = new Date(today);
  last30Days.setDate(today.getDate() - 30);

  const last7Days = new Date(today);
  last7Days.setDate(today.getDate() - 7);

  return {
    today: formatDate(today),
    yesterday: formatDate(yesterday),
    lastWeekStart: formatDate(lastWeekStart),
    lastWeekEnd: formatDate(lastWeekEnd),
    thisWeekStart: formatDate(thisWeekStart),
    lastMonthStart: formatDate(lastMonthStart),
    lastMonthEnd: formatDate(lastMonthEnd),
    last30Days: formatDate(last30Days),
    last7Days: formatDate(last7Days),
  };
}

function buildSystemPrompt(
  dateCtx: ReturnType<typeof getDateContext>,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  const historyContext = conversationHistory && conversationHistory.length > 0
    ? `\n\nCONVERSATION CONTEXT (for understanding previous date ranges, filters, or entities mentioned):\n${conversationHistory.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n')}`
    : '';

  return `You are a query parser for a workforce analytics system. Parse natural language questions into structured components.

Available metrics:
- total_duration: Total working time
- productive_duration: Time spent productively
- unproductive_duration: Time spent unproductively
- neutral_duration: Neutral activity time
- project_duration: Time on projects
- non_project_duration: Time not on projects
- idle_duration: Idle time
- productivity_rate: productive_duration / total_duration (calculated)

Available entities:
- users: Individual employees
- teams: Groups of employees
- projects: Work projects (billable/non-billable)
- apps/applications: Software applications used

CRITICAL DATE REFERENCE (use these exact dates):
- Today: ${dateCtx.today}
- Yesterday: ${dateCtx.yesterday}
- Last week: ${dateCtx.lastWeekStart} to ${dateCtx.lastWeekEnd}
- This week: ${dateCtx.thisWeekStart} to ${dateCtx.today}
- Last month: ${dateCtx.lastMonthStart} to ${dateCtx.lastMonthEnd}
- Last 7 days: ${dateCtx.last7Days} to ${dateCtx.today}
- Last 30 days: ${dateCtx.last30Days} to ${dateCtx.today}

chat history:
${historyContext}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "intent": "summary|comparison|trend|drill_down|list",
  "entity": "users|teams|projects|apps|daily_usage|app_usage|classification_rules" (REQUIRED for list intent),
  "metrics": ["metric1", "metric2"] (leave empty for list queries),
  "filters": {
    "teams": ["team name if mentioned"],
    "users": ["user name if mentioned"],
    "projects": ["project name if mentioned"],
    "apps": ["app name if mentioned"],
    "dateRange": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} (omit for list queries),
    "productivityRating": ["productive", "neutral", "unproductive"]
  },
  "groupBy": ["field to group by"],
  "orderBy": "field to sort by",
  "limit": number or null
}

Intent meanings:
- summary: Aggregate stats (totals, averages)
- comparison: Compare between groups/time periods
- trend: Show changes over time
- drill_down: Detailed breakdown
- list: List specific items or entities

CRITICAL FOR LIST QUERIES:
- ALWAYS set the "entity" field for list queries
- "list projects" or "show projects" → entity: "projects"
- "list teams" or "show teams" → entity: "teams"
- "list users" or "show users" → entity: "users"
- "list classification rules" → entity: "classification_rules"
- "list apps" → entity: "apps"
- For list queries, DO NOT set metrics or date ranges unless specifically requested
- List queries should have minimal filters - just the entity type

Examples:
- "list out projects" → {"intent": "list", "entity": "projects"}
- "show all teams" → {"intent": "list", "entity": "teams"}
- "list users" → {"intent": "list", "entity": "users"}
- "show productivity trends for the last 7 days" → {"intent": "trend", "dateRange": {"start": "2025-12-12", "end": "2025-12-19"}}
- "productivity trends last month" → {"intent": "trend", "dateRange": {"start": "2025-11-01", "end": "2025-11-30"}}

DATE RANGE HANDLING:
- For relative dates: "last 7 days", "this month", "last quarter, last week" → use dateRange with calculated dates
- For specific dates: "from 2026-01-01 to 2026-01-31" → extract exact dates into dateRange.start and dateRange.end
- For single dates: "on 2026-01-15" → set both start and end to same date
- ALWAYS include dateRange object when any date reference is found

IMPORTANT: Use conversation context to understand date references that span multiple messages.`;
}

export async function parseQuery(
  userQuery: string,
  context?: { today?: string; conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }> }
): Promise<ParsedQuery> {
  const lowerQuery = userQuery.toLowerCase();

  // Direct pattern matching for simple list queries
  if (lowerQuery.includes('list') || lowerQuery.includes('show')) {
    console.log(`🔍 Direct parsing for list query: "${userQuery}"`);

    if (lowerQuery.includes('project') && !lowerQuery.includes('time')) {
      console.log('✅ Direct detected: projects');
      return {
        intent: 'list',
        entity: 'projects',
        metrics: [],
        filters: {},
      };
    } else if (lowerQuery.includes('team') && !lowerQuery.includes('member')) {
      console.log('✅ Direct detected: teams');
      return {
        intent: 'list',
        entity: 'teams',
        metrics: [],
        filters: {},
      };
    } else if (lowerQuery.includes('user') || lowerQuery.includes('employee') || lowerQuery.includes('member')) {
      console.log('✅ Direct detected: users');
      return {
        intent: 'list',
        entity: 'users',
        metrics: [],
        filters: {},
      };
    } else if (lowerQuery.includes('classification') || lowerQuery.includes('rule')) {
      console.log('✅ Direct detected: classification_rules');
      return {
        intent: 'list',
        entity: 'classification_rules',
        metrics: [],
        filters: {},
      };
    } else if (lowerQuery.includes('app') || lowerQuery.includes('application')) {
      console.log('✅ Direct detected: apps');
      return {
        intent: 'list',
        entity: 'apps',
        metrics: [],
        filters: {},
      };
    }
  }

  // For complex queries that don't match simple patterns, use LLM
  console.log(`🤖 Using LLM for complex query: "${userQuery}"`);
  const dateCtx = getDateContext();
  const systemPrompt = buildSystemPrompt(dateCtx, context?.conversationHistory);

  const response = await chat(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Parse this query: "${userQuery}"`,
      },
    ],
    { model: MODELS.FAST, temperature: 0 }
  );

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());
    console.log('📝 LLM parsed query:', JSON.stringify(parsed, null, 2));
    console.log('📅 Date context:', JSON.stringify(dateCtx, null, 2));

    // Validate date range format
    let dateRange = parsed.filters?.dateRange;
    if (dateRange) {
      // Validate dates are in correct format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateRange.start) || !dateRegex.test(dateRange.end)) {
        console.warn('Invalid date format, using fallback dates');
        dateRange = inferDateRange(userQuery, dateCtx);
      }
    } else {
      // Try to infer date range from query
      dateRange = inferDateRange(userQuery, dateCtx);
    }

    return {
      intent: parsed.intent || 'unknown',
      entity: parsed.entity,
      metrics: parsed.metrics || [],
      filters: {
        ...parsed.filters,
        dateRange,
      },
      groupBy: parsed.groupBy || [],
      orderBy: parsed.orderBy,
      limit: parsed.limit,
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', response);
    // Fallback to basic parsing
    return {
      intent: 'unknown',
      metrics: [],
      filters: {},
    };
  }
}

/**
 * Parse relative date strings into date range (YYYY-MM-DD format)
 * Handles: "last month", "last week", "this month", "from January to March", etc.
 */
function parseRelativeDate(relative: string): { start: string; end: string } {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const lower = relative.toLowerCase().trim();

  // Handle "from X to Y" patterns
  if (lower.includes("from") && lower.includes("to")) {
    return parseFromToRange(relative, today);
  }

  // Handle "last month" (previous calendar month)
  if (lower === "last month" || lower === "previous month") {
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      0
    );
    return {
      start: `${lastMonth.getFullYear()}-${String(
        lastMonth.getMonth() + 1
      ).padStart(2, "0")}-01`,
      end: `${lastDayOfLastMonth.getFullYear()}-${String(
        lastDayOfLastMonth.getMonth() + 1
      ).padStart(2, "0")}-${String(lastDayOfLastMonth.getDate()).padStart(
        2,
        "0"
      )}`,
    };
  }

  // Handle "this month" (current calendar month)
  if (lower === "this month" || lower === "current month") {
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      start: `${firstDayOfMonth.getFullYear()}-${String(
        firstDayOfMonth.getMonth() + 1
      ).padStart(2, "0")}-01`,
      end: today.toISOString().split("T")[0],
    };
  }

  // Handle "last week" (previous calendar week, Monday to Sunday)
  if (lower === "last week" || lower === "previous week") {
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    return {
      start: lastMonday.toISOString().split("T")[0],
      end: lastSunday.toISOString().split("T")[0],
    };
  }

  // Handle "this week" (current calendar week, Monday to today)
  if (lower === "this week" || lower === "current week") {
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - daysToMonday);
    thisMonday.setHours(0, 0, 0, 0);

    return {
      start: thisMonday.toISOString().split("T")[0],
      end: today.toISOString().split("T")[0],
    };
  }

  // Handle "last quarter" (previous fiscal/business quarter)
  if (lower === "last quarter" || lower === "previous quarter") {
    const currentMonth = today.getMonth(); // 0-11
    const currentYear = today.getFullYear();

    // Determine previous quarter
    let quarterStartMonth: number;
    let quarterEndMonth: number;
    let year = currentYear;

    if (currentMonth >= 0 && currentMonth <= 2) {
      // Current is Q1 (Jan-Mar), so last quarter is Q4 of previous year
      quarterStartMonth = 9; // October
      quarterEndMonth = 11; // December
      year = currentYear - 1;
    } else if (currentMonth >= 3 && currentMonth <= 5) {
      // Current is Q2 (Apr-Jun), so last quarter is Q1
      quarterStartMonth = 0; // January
      quarterEndMonth = 2; // March
    } else if (currentMonth >= 6 && currentMonth <= 8) {
      // Current is Q3 (Jul-Sep), so last quarter is Q2
      quarterStartMonth = 3; // April
      quarterEndMonth = 5; // June
    } else {
      // Current is Q4 (Oct-Dec), so last quarter is Q3
      quarterStartMonth = 6; // July
      quarterEndMonth = 8; // September
    }

    const from = new Date(year, quarterStartMonth, 1);
    const to = new Date(year, quarterEndMonth + 1, 0); // Last day of quarter end month

    return {
      start: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(
        2,
        "0"
      )}-01`,
      end: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(to.getDate()).padStart(2, "0")}`,
    };
  }

  // Handle "this quarter" (current fiscal/business quarter)
  if (lower === "this quarter" || lower === "current quarter") {
    const currentMonth = today.getMonth(); // 0-11
    const currentYear = today.getFullYear();

    // Determine current quarter
    let quarterStartMonth: number;
    let quarterEndMonth: number;

    if (currentMonth >= 0 && currentMonth <= 2) {
      // Q1 (Jan-Mar)
      quarterStartMonth = 0; // January
      quarterEndMonth = 2; // March
    } else if (currentMonth >= 3 && currentMonth <= 5) {
      // Q2 (Apr-Jun)
      quarterStartMonth = 3; // April
      quarterEndMonth = 5; // June
    } else if (currentMonth >= 6 && currentMonth <= 8) {
      // Q3 (Jul-Sep)
      quarterStartMonth = 6; // July
      quarterEndMonth = 8; // September
    } else {
      // Q4 (Oct-Dec)
      quarterStartMonth = 9; // October
      quarterEndMonth = 11; // December
    }

    const from = new Date(currentYear, quarterStartMonth, 1);
    const to = today; // Current date

    return {
      start: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(
        2,
        "0"
      )}-01`,
      end: today.toISOString().split("T")[0],
    };
  }

  // Handle "last year" (previous calendar year)
  if (lower === "last year" || lower === "previous year") {
    const lastYear = today.getFullYear() - 1;
    return {
      start: `${lastYear}-01-01`,
      end: `${lastYear}-12-31`,
    };
  }

  // Handle "this year" (current calendar year)
  if (lower === "this year" || lower === "current year") {
    const thisYear = today.getFullYear();
    return {
      start: `${thisYear}-01-01`,
      end: today.toISOString().split("T")[0],
    };
  }

  // Handle quarter patterns like "Q4", "4th quarter", "quarter 4"
  const quarterMatch = lower.match(/(?:q|quarter)\s*(\d+)/i);
  if (quarterMatch) {
    const quarterNum = parseInt(quarterMatch[1], 10);
    if (quarterNum >= 1 && quarterNum <= 4) {
      // Determine year - if quarter hasn't started yet this year, assume previous year
      let year = today.getFullYear();
      const currentQuarter = Math.floor(today.getMonth() / 3) + 1;

      if (quarterNum > currentQuarter) {
        year = year - 1;
      }

      const quarterStartMonth = (quarterNum - 1) * 3;
      const quarterEndMonth = quarterStartMonth + 2;

      const from = new Date(year, quarterStartMonth, 1);
      const to = new Date(year, quarterEndMonth + 1, 0); // Last day of quarter end month

      return {
        start: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(
          2,
          "0"
        )}-01`,
        end: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(to.getDate()).padStart(2, "0")}`,
      };
    }
  }

  // Handle "last N months/weeks/days/years"
  const numberMatch = lower.match(/(\d+)\s*(month|week|day|year)/);
  if (numberMatch) {
    const number = parseInt(numberMatch[1], 10);
    const unit = numberMatch[2];

    const from = new Date(today);
    if (unit === "month") {
      from.setMonth(from.getMonth() - number);
    } else if (unit === "week") {
      from.setDate(from.getDate() - number * 7);
    } else if (unit === "day") {
      from.setDate(from.getDate() - number);
    } else if (unit === "year") {
      from.setFullYear(from.getFullYear() - number);
    }

    from.setHours(0, 0, 0, 0);
    return {
      start: from.toISOString().split("T")[0],
      end: today.toISOString().split("T")[0],
    };
  }

  // Handle month names (e.g., "november", "january", "december")
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  const monthIndex = monthNames.findIndex(
    (month) => lower === month || lower.includes(month)
  );
  if (monthIndex !== -1) {
    // Determine the year: use current year if month hasn't passed, or if it's the current month
    // Otherwise, assume previous year if the month has already passed
    let year = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11

    // If the requested month is in the future (relative to current month), use previous year
    // If it's the current month or past month in current year, use current year
    if (monthIndex > currentMonth) {
      year = year - 1;
    }

    // Get first day of the month
    const firstDay = new Date(year, monthIndex, 1);
    // Get last day of the month
    const lastDay = new Date(year, monthIndex + 1, 0);

    return {
      start: `${firstDay.getFullYear()}-${String(
        firstDay.getMonth() + 1
      ).padStart(2, "0")}-01`,
      end: `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(lastDay.getDate()).padStart(2, "0")}`,
    };
  }

  // Default: last 30 days
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  from.setHours(0, 0, 0, 0);
  return {
    start: from.toISOString().split("T")[0],
    end: today.toISOString().split("T")[0],
  };
}

/**
 * Parse "from X to Y" date ranges
 */
function parseFromToRange(
  relative: string,
  today: Date
): {
  start: string;
  end: string;
} {
  const lower = relative.toLowerCase();
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  // Extract "from X to Y" pattern
  const fromMatch = lower.match(/from\s+(.+?)\s+to\s+(.+)/);
  if (!fromMatch) {
    throw new Error(`Could not parse date range: ${relative}`);
  }

  const fromPart = fromMatch[1].trim();
  const toPart = fromMatch[2].trim();

  // Handle "from last month to this month"
  if (fromPart.includes("last month") && toPart.includes("this month")) {
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      start: `${lastMonth.getFullYear()}-${String(
        lastMonth.getMonth() + 1
      ).padStart(2, "0")}-01`,
      end: today.toISOString().split("T")[0],
    };
  }

  // Handle "from [Month] to [Month]" (e.g., "from January to March")
  const fromMonthIndex = monthNames.findIndex((m) => fromPart.includes(m));
  const toMonthIndex = monthNames.findIndex((m) => toPart.includes(m));

  if (fromMonthIndex !== -1 && toMonthIndex !== -1) {
    // Assume current year unless specified
    const year = today.getFullYear();
    const fromDate = new Date(year, fromMonthIndex, 1);
    const toDate = new Date(year, toMonthIndex + 1, 0); // Last day of toMonth

    return {
      start: `${fromDate.getFullYear()}-${String(
        fromDate.getMonth() + 1
      ).padStart(2, "0")}-01`,
      end: `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(toDate.getDate()).padStart(2, "0")}`,
    };
  }

  // Try to parse as regular dates
  try {
    const fromDate = new Date(fromPart);
    const toDate = new Date(toPart);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new Error(`Invalid date format in range: ${relative}`);
    }

    return {
      start: fromDate.toISOString().split("T")[0],
      end: toDate.toISOString().split("T")[0],
    };
  } catch (error) {
    // Fallback: last 30 days
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
    return {
      start: from.toISOString().split("T")[0],
      end: today.toISOString().split("T")[0],
    };
  }
}

/**
 * Extract date range using advanced parsing logic
 */
function extractDateRange(query: string, dateCtx: ReturnType<typeof getDateContext>): { start: string; end: string } {
  const lowerQuery = query.toLowerCase();

  // First check for direct keyword matches (fast path)
  if (lowerQuery.includes('last week') || lowerQuery.includes('past week')) {
    return { start: dateCtx.lastWeekStart, end: dateCtx.lastWeekEnd };
  }
  if (lowerQuery.includes('this week')) {
    return { start: dateCtx.thisWeekStart, end: dateCtx.today };
  }
  if (lowerQuery.includes('last month') || lowerQuery.includes('past month')) {
    return { start: dateCtx.lastMonthStart, end: dateCtx.lastMonthEnd };
  }
  if (lowerQuery.includes('yesterday')) {
    return { start: dateCtx.yesterday, end: dateCtx.yesterday };
  }
  if (lowerQuery.includes('today')) {
    return { start: dateCtx.today, end: dateCtx.today };
  }
  if (lowerQuery.includes('last 7 days') || lowerQuery.includes('past 7 days')) {
    return { start: dateCtx.last7Days, end: dateCtx.today };
  }
  if (lowerQuery.includes('last 30 days') || lowerQuery.includes('past 30 days')) {
    return { start: dateCtx.last30Days, end: dateCtx.today };
  }

  // For more complex expressions, use the advanced parsing
  try {
    // Extract relative date expressions from the query
    const relativeMatches = lowerQuery.match(/(?:last|this|previous|current|from\s+.+?\s+to)\s+(?:month|week|quarter|year|\d+\s+(?:month|week|day|year)s?|(?:january|february|march|april|may|june|july|august|september|october|november|december)|q\d+|quarter\s+\d+)/gi);

    if (relativeMatches && relativeMatches.length > 0) {
      // Use the first relative date expression found
      const relativeDate = relativeMatches[0].trim();
      return parseRelativeDate(relativeDate);
    }
  } catch (error) {
    console.warn('Advanced date parsing failed, using fallback:', error);
  }

  // Default to last 30 days
  return { start: dateCtx.last30Days, end: dateCtx.today };
}

/**
 * Extract date range directly from current context
 */
function inferDateRange(
  query: string,
  dateCtx: ReturnType<typeof getDateContext>
): { start: string; end: string } | undefined {
  return extractDateRange(query, dateCtx);
}
