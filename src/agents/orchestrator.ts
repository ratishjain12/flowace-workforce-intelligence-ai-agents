import { AuthenticatedUser } from '../middleware/auth';
import { handleChatQuery } from './chat';
import {
  classifyNewApp,
  getPendingClassifications,
  approveClassification,
  rejectClassification,
  getClassificationRules,
} from './classification';

export type AgentType = 'chat' | 'classification';

export interface OrchestratorRequest {
  type: AgentType;
  action: string;
  payload: any;
  user: AuthenticatedUser;
}

export interface OrchestratorResponse {
  success: boolean;
  data?: any;
  error?: string;
  agentUsed: AgentType;
  executionTimeMs: number;
}

/**
 * Main orchestrator that routes requests to appropriate agents
 */
export async function orchestrate(
  request: OrchestratorRequest
): Promise<OrchestratorResponse> {
  const startTime = Date.now();

  try {
    let data: any;

    switch (request.type) {
      case 'chat':
        data = await handleChatRequest(request);
        break;

      case 'classification':
        data = await handleClassificationRequest(request);
        break;

      default:
        throw new Error(`Unknown agent type: ${request.type}`);
    }

    return {
      success: true,
      data,
      agentUsed: request.type,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      agentUsed: request.type,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

async function handleChatRequest(request: OrchestratorRequest): Promise<any> {
  switch (request.action) {
    case 'query':
      return handleChatQuery(request.payload.query, request.user, request.payload.options);

    default:
      throw new Error(`Unknown chat action: ${request.action}`);
  }
}

async function handleClassificationRequest(request: OrchestratorRequest): Promise<any> {
  switch (request.action) {
    case 'classify':
      return classifyNewApp(request.payload.appName, request.user);

    case 'getPending':
      return getPendingClassifications(request.user, request.payload);

    case 'approve':
      await approveClassification(
        request.payload.id,
        request.user,
        request.payload.options
      );
      return { message: 'Classification approved' };

    case 'reject':
      await rejectClassification(
        request.payload.id,
        request.user,
        request.payload.reason
      );
      return { message: 'Classification rejected' };

    case 'getRules':
      return getClassificationRules(request.payload);

    default:
      throw new Error(`Unknown classification action: ${request.action}`);
  }
}

/**
 * Detect intent from natural language and route to appropriate agent
 * This is useful for a unified chat interface
 */
export async function detectAndRoute(
  message: string,
  user: AuthenticatedUser
): Promise<OrchestratorResponse> {
  // Simple intent detection - could be enhanced with LLM
  const lowerMessage = message.toLowerCase();

  // Classification intents
  if (
    lowerMessage.includes('classify') ||
    lowerMessage.includes('categorize') ||
    lowerMessage.includes('mark as productive') ||
    lowerMessage.includes('mark as unproductive')
  ) {
    // Extract app name - simplified
    const appNameMatch = message.match(/["']([^"']+)["']/) ||
      message.match(/classify\s+(\w+)/i);

    if (appNameMatch) {
      return orchestrate({
        type: 'classification',
        action: 'classify',
        payload: { appName: appNameMatch[1] },
        user,
      });
    }
  }

  // Default to chat for analytics queries
  return orchestrate({
    type: 'chat',
    action: 'query',
    payload: { query: message },
    user,
  });
}
