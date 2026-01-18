import { chat, MODELS } from '../../config/groq';
import { QueryResult } from '../../services/queryExecutor';

const SYSTEM_PROMPT = `You are an analytics assistant for a workforce intelligence platform. Your job is to explain query results in clear, natural language with proper markdown formatting.

Guidelines:
1. Be concise but informative
2. Highlight key insights and patterns
3. Format numbers properly with commas for thousands and appropriate units
4. Use natural language responses (e.g., "A total of 35,881 hours were worked last month" not "total hours: 35881.15")
5. Add context and units: hours, percentages, minutes, etc.
6. If data is empty, explain what that means
7. Never fabricate data - only describe what's in the results
8. Use proper markdown formatting:
   - **Bold** key metrics and numbers
   - Line breaks between different pieces of information
   - Bullet points (- ) for lists
   - Numbered lists when ranking items
9. Mention the time period if relevant
10. For single metric queries, give direct answers (e.g., "The average productivity rate last week was 78.5%")

Examples:
- "How many total hours?" → "A total of **35,881 hours** were worked last month"
- "What was the average productivity?" → "The average productivity rate last week was **78.5%**"
- "Show productivity trends" → "Productivity showed an upward trend over the last 7 days, peaking at **85%** on Wednesday"
- Multiple metrics → Use line breaks and bold formatting

Always use proper line breaks and markdown formatting for readability.`;

export interface ExplainedResponse {
  answer: string;
  summary: {
    totalRecords: number;
    dateRange?: string;
    keyMetrics: Record<string, any>;
  };
}

export async function explainResults(
  userQuery: string,
  sqlDescription: string,
  result: QueryResult
): Promise<ExplainedResponse> {
  // Extract key metrics from results
  const keyMetrics = extractKeyMetrics(result.rows);
  const dateRange = extractDateRange(result.rows);

  // If no data, return early
  if (result.rowCount === 0) {
    return {
      answer: `No data found for your query: "${userQuery}". This could mean there's no activity recorded for the specified criteria or time period.`,
      summary: {
        totalRecords: 0,
        keyMetrics: {},
      },
    };
  }

  // For small result sets, just format directly
  if (result.rowCount <= 5) {
    const formattedAnswer = formatSimpleResults(userQuery, result.rows, keyMetrics);
    return {
      answer: formattedAnswer,
      summary: {
        totalRecords: result.rowCount,
        dateRange,
        keyMetrics,
      },
    };
  }

  // For larger result sets, use LLM to summarize
  const response = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `User asked: "${userQuery}"

Query description: ${sqlDescription}

Data summary:
- Total records: ${result.rowCount}
- Date range: ${dateRange || 'Not specified'}
- Sample data (first 10 rows): ${JSON.stringify(result.rows.slice(0, 10), null, 2)}

Key metrics:
${JSON.stringify(keyMetrics, null, 2)}

Provide a clear, natural language answer to the user's question based on this data.

Use proper markdown formatting:
- **Bold** important numbers and metrics
- Use line breaks between different sections
- Use bullet points for lists
- Format numbers with commas and appropriate units
- Keep the response readable and well-structured`,
      },
    ],
    { model: MODELS.FAST, temperature: 0.3 }
  );

  return {
    answer: response,
    summary: {
      totalRecords: result.rowCount,
      dateRange,
      keyMetrics,
    },
  };
}

function extractKeyMetrics(rows: any[]): Record<string, any> {
  if (rows.length === 0) return {};

  const metrics: Record<string, any> = {};
  const numericColumns: string[] = [];

  // Identify numeric columns from first row
  const firstRow = rows[0];
  for (const key of Object.keys(firstRow)) {
    if (typeof firstRow[key] === 'number' || !isNaN(parseFloat(firstRow[key]))) {
      numericColumns.push(key);
    }
  }

  // Calculate aggregates for numeric columns
  for (const col of numericColumns) {
    const values = rows
      .map((r) => parseFloat(r[col]))
      .filter((v) => !isNaN(v));

    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);

      metrics[col] = {
        total: formatNumberForMetrics(sum, col),
        average: formatNumberForMetrics(avg, col),
        max: formatNumberForMetrics(max, col),
        min: formatNumberForMetrics(min, col),
      };
    }
  }

  return metrics;
}

function extractDateRange(rows: any[]): string | undefined {
  const dateColumns = ['date', 'created_at', 'timestamp'];

  for (const col of dateColumns) {
    const dates = rows
      .filter((r) => r[col])
      .map((r) => new Date(r[col]))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length > 0) {
      const start = dates[0].toISOString().split('T')[0];
      const end = dates[dates.length - 1].toISOString().split('T')[0];
      return start === end ? start : `${start} to ${end}`;
    }
  }

  return undefined;
}

function formatSimpleResults(
  userQuery: string,
  rows: any[],
  keyMetrics: Record<string, any>
): string {
  // Check if this is a single metric query (like "How many total hours?")
  const lowerQuery = userQuery.toLowerCase();
  const isSingleMetricQuery = (
    lowerQuery.includes('how many') ||
    lowerQuery.includes('how much') ||
    lowerQuery.includes('what is the') ||
    lowerQuery.includes('what was the') ||
    (rows.length === 1 && Object.keys(rows[0]).length === 1)
  );

  if (rows.length === 1 && isSingleMetricQuery) {
    const row = rows[0];
    const [key, value] = Object.entries(row)[0];

    if (typeof value === 'number') {
      const formattedValue = formatNumber(value, key);
      return generateNaturalLanguageResponse(userQuery, key, formattedValue);
    }
  }

  if (rows.length === 1) {
    const row = rows[0];
    const parts: string[] = [];

    for (const [key, value] of Object.entries(row)) {
      const formattedKey = key.replace(/_/g, ' ');
      let formattedValue = value;

      if (typeof value === 'number') {
        formattedValue = formatNumber(value, key);
      }

      parts.push(`**${formattedKey}**: **${formattedValue}**`);
    }

    return parts.join('\n\n');
  }

  // Multiple rows - create a brief summary
  const lines: string[] = [`Found **${rows.length}** results:\n`];

  for (const row of rows.slice(0, 5)) {
    const mainValue = Object.values(row)[0];
    const secondValue = Object.values(row)[1];
    const formattedMain = typeof mainValue === 'number' ? formatNumber(mainValue, Object.keys(row)[0]) : mainValue;
    const formattedSecond = typeof secondValue === 'number' ? formatNumber(secondValue, Object.keys(row)[1]) : secondValue;
    lines.push(`- **${formattedMain}**: ${formattedSecond}`);
  }

  if (rows.length > 5) {
    lines.push(`\n... and **${rows.length - 5}** more results`);
  }

  return lines.join('\n');
}

function formatNumber(value: number, key: string): string {
  // Round to appropriate decimal places
  let rounded = value;
  if (key.includes('rate') || key.includes('percent') || key.includes('productivity')) {
    rounded = Math.round(value * 100) / 100; // 2 decimal places for percentages
  } else if (key.includes('hour') || key.includes('duration')) {
    rounded = Math.round(value * 100) / 100; // 2 decimal places for time
  } else {
    rounded = Math.round(value * 100) / 100; // General rounding
  }

  // Format with commas for thousands
  const formatted = new Intl.NumberFormat('en-US').format(rounded);

  // Add appropriate units
  if (key.includes('hour')) {
    return `${formatted} hours`;
  } else if (key.includes('rate') || key.includes('percent') || key.includes('productivity')) {
    return `${formatted}%`;
  } else if (key.includes('duration') || key.includes('minutes')) {
    return `${formatted} minutes`;
  }

  return formatted;
}

function formatNumberForMetrics(value: number, key: string): number {
  // Round to appropriate decimal places for metrics (return number, not string)
  if (key.includes('rate') || key.includes('percent') || key.includes('productivity')) {
    return Math.round(value * 100) / 100; // 2 decimal places for percentages
  } else if (key.includes('hour') || key.includes('duration')) {
    return Math.round(value * 100) / 100; // 2 decimal places for time
  } else {
    return Math.round(value * 100) / 100; // General rounding
  }
}

function generateNaturalLanguageResponse(query: string, metric: string, value: string): string {
  const lowerQuery = query.toLowerCase();
  const metricName = metric.replace(/_/g, ' ');

  // Handle specific query patterns
  if (lowerQuery.includes('how many') && lowerQuery.includes('total')) {
    return `A total of **${value}** were recorded.`;
  }

  if (lowerQuery.includes('how many')) {
    return `**${value}** were found.`;
  }

  if (lowerQuery.includes('how much') || lowerQuery.includes('what is the') || lowerQuery.includes('what was the')) {
    if (metricName.includes('rate') || metricName.includes('percent')) {
      return `The ${metricName} was **${value}**.`;
    }
    return `The ${metricName} was **${value}**.`;
  }

  // Default natural language response
  return `The ${metricName} is **${value}**.`;
}
