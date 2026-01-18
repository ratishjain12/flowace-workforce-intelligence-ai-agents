import { parseQuery } from './parser';
import { generateSQL, generateFallbackSQL } from './sqlGenerator';
import { explainResults } from './explainer';
import { executeQueryWithTimeout, validateQuery } from '../../services/queryExecutor';
import { logAgentAction } from '../../services/auditLogger';
import { chat, MODELS } from '../../config/groq';
import { AuthenticatedUser } from '../../middleware/auth';
import { ChatResponse } from '../../types';

export interface ChatAgentOptions {
  timeout?: number;
  maxRetries?: number;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function handleChatQuery(
  userQuery: string,
  user: AuthenticatedUser,
  options: ChatAgentOptions = {}
): Promise<ChatResponse> {
  const startTime = Date.now();
  const { timeout = 30000, maxRetries = 2, conversationHistory = [] } = options;

  let sqlGenerated = '';
  let tablesAccessed: string[] = [];
  let success = true;
  let errorMessage: string | undefined;

  try {
    // Step 1: Check if this is a general conversation query (not a data query)
    const queryType = await classifyQueryType(userQuery, conversationHistory);
    console.log('Query type for "' + userQuery + '":', queryType);

    if (queryType === 'general') {
      // Handle as general conversation
      const generalResponse = await handleGeneralQuery(userQuery, user, conversationHistory);
      
      await logAgentAction({
        agentType: 'chat',
        userId: user.id,
        queryText: userQuery,
        response: generalResponse,
        sqlGenerated: undefined,
        dataAccessed: [],
        executionTimeMs: Date.now() - startTime,
        success: true,
      });

      return {
        answer: generalResponse,
        explanation: {
          sql: 'N/A (general conversation)',
          rowCount: 0,
          dateRange: 'N/A',
          tablesAccessed: [],
        },
        confidence: 1,
        isGeneralQuery: true,
      };
    }

    // Step 2: Parse the natural language query
    console.log('Parsing query...');
    const parsedQuery = await parseQuery(userQuery, {
      today: new Date().toISOString().split('T')[0],
      conversationHistory,
    });
    console.log('📝 Parsed query:', JSON.stringify(parsedQuery, null, 2));

    // Step 3: Generate SQL
    console.log('Generating SQL...');
    let generated;
    try {
      generated = await generateSQL(parsedQuery, user);
  } catch (error) {
    console.error('❌ Chat processing failed:', error);
    // Add more detailed error logging
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw error;
  }

    sqlGenerated = generated.sql;
    console.log('Generated SQL:', sqlGenerated);
    console.log('SQL Params:', generated.params);

    // Step 4: Validate the SQL
    const validation = validateQuery(generated.sql);
    if (!validation.valid) {
      throw new Error(`Invalid SQL: ${validation.error}`);
    }
    tablesAccessed = validation.tablesAccessed;

    // Step 5: Execute the query
    console.log('Executing query...');
    const result = await executeQueryWithTimeout(
      generated.sql,
      generated.params,
      timeout
    );
    console.log(`Query returned ${result.rowCount} rows`);

    // Step 6: Generate explanation
    console.log('Generating explanation...');
    const explained = await explainResults(
      userQuery,
      generated.description,
      result
    );

    const response: ChatResponse = {
      answer: explained.answer,
      explanation: {
        sql: generated.sql,
        rowCount: result.rowCount,
        dateRange: explained.summary.dateRange || 'Not specified',
        tablesAccessed,
      },
      confidence: calculateConfidence(parsedQuery, result),
    };

    // Log successful action
    await logAgentAction({
      agentType: 'chat',
      userId: user.id,
      queryText: userQuery,
      response: explained.answer,
      sqlGenerated,
      dataAccessed: tablesAccessed,
      executionTimeMs: Date.now() - startTime,
      success: true,
    });

    return response;
  } catch (error) {
    success = false;
    errorMessage = (error as Error).message;

    // Log failed action
    await logAgentAction({
      agentType: 'chat',
      userId: user.id,
      queryText: userQuery,
      sqlGenerated: sqlGenerated || undefined,
      dataAccessed: tablesAccessed,
      executionTimeMs: Date.now() - startTime,
      success: false,
      errorMessage,
    });

    // Return error response
    return {
      answer: `I couldn't process your query. ${errorMessage}`,
      explanation: {
        sql: sqlGenerated || 'Not generated',
        rowCount: 0,
        dateRange: 'N/A',
        tablesAccessed: [],
      },
      confidence: 0,
    };
  }
}

/**
 * Classify whether the query is a general conversation or a data query using LLM
 */
async function classifyQueryType(
  query: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<'data' | 'general'> {
  // Quick checks for obvious cases (avoiding unnecessary LLM calls)
  const lowerQuery = query.toLowerCase().trim();

  // Very short conversational queries
  if (query.split(' ').length <= 2) {
    const shortConversational = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no', 'bye'];
    if (shortConversational.some(word => lowerQuery.includes(word))) {
      return 'general';
    }
  }

  console.log('🔍 Classifying query with LLM:', query);

  // Use LLM for classification with context awareness
  const systemPrompt = `You are a query classifier for a Workforce Intelligence Platform. Your task is to determine if a user query is asking for data analysis or just general conversation.

DATA QUERIES include:
- Questions about productivity, hours, time, duration, work patterns
- Requests to show, list, compare, analyze workforce metrics
- Questions about teams, users, projects, applications
- List queries: "list projects", "show all teams", "get users", "display apps"
- Time-based analysis (trends, comparisons, summaries)
- Quantitative questions (how many, how much, averages, totals)
- Any query asking for workforce data, analytics, or metrics

GENERAL QUERIES include:
- Greetings, thanks, acknowledgments
- Questions about what you can do or how to use the system
- Casual conversation, small talk
- Commands like "help", "guide me", "explain"
- Very short responses or confirmations

Consider the conversation history to understand context. If the user is continuing a general conversation, classify as general.

Respond with ONLY "data" or "general" (lowercase, no quotes, no explanation).`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];

  // Include recent conversation history for context (last 4 exchanges)
  const recentHistory = history.slice(-4);
  messages.push(...recentHistory.map(msg => ({
    role: msg.role,
    content: msg.content
  })));

  // Add the current query
  messages.push({
    role: 'user',
    content: `Classify this query: "${query}"`
  });

  try {
    const response = await chat(messages, {
      model: MODELS.FAST,
      temperature: 0,
      maxTokens: 10
    });

    const classification = response.trim().toLowerCase();
    console.log('🤖 LLM classification response:', classification);

    if (classification === 'data' || classification === 'general') {
      return classification;
    }

    // Fallback if LLM gives unexpected response
    console.warn('Unexpected LLM classification response:', response);
    return 'data'; // Default to data for workforce analytics context

  } catch (error) {
    console.error('❌ Chat processing failed:', error);
    // Add more detailed error logging
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw error;
  }
}

/**
 * Handle general conversation queries
 */
async function handleGeneralQuery(
  query: string,
  user: AuthenticatedUser,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const systemPrompt = `You are a helpful assistant for a Workforce Intelligence Platform. Your role is to:

1. Answer general questions and greetings politely
2. Help users understand what they can ask about
3. Guide users to ask data-related questions about workforce analytics

When users ask about what they can query, suggest examples like:
- Productivity rates and trends
- Hours worked by team or individual
- Application usage patterns
- Project time allocation
- Team performance comparisons
- Time period comparisons

Keep responses conversational, helpful, and concise (under 100 words).
If someone asks something completely unrelated to workforce analytics, politely redirect them back to the platform's capabilities.`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: query },
  ];

  const response = await chat(messages, {
    model: MODELS.FAST,
    temperature: 0.7,
    maxTokens: 500,
  });

  return response;
}

function calculateConfidence(parsedQuery: any, result: any): number {
  let confidence = 0.5; // Base confidence

  // Higher confidence for known intents
  if (parsedQuery.intent !== 'unknown') {
    confidence += 0.2;
  }

  // Higher confidence if we got results
  if (result.rowCount > 0) {
    confidence += 0.2;
  }

  // Higher confidence for specific metrics
  if (parsedQuery.metrics && parsedQuery.metrics.length > 0) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1);
}

export { parseQuery, generateSQL, explainResults };
