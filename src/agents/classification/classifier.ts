import { chat, MODELS } from '../../config/groq';
import { AppAnalysis } from './analyzer';
import { ProductivityRating } from '../../types';

export interface ClassificationResult {
  classification: ProductivityRating;
  confidence: number;
  reasoning: string;
  factors: string[];
}

const SYSTEM_PROMPT = `You are an application classification agent for a workforce productivity platform. Your job is to classify applications as productive, neutral, or unproductive based on usage patterns and context.

Classification Guidelines:

PRODUCTIVE applications:
- Development tools (VS Code, IntelliJ, GitHub, etc.)
- Project management (Jira, Asana, Linear, etc.)
- Communication for work (Slack, Teams, Zoom for meetings)
- Documentation (Confluence, Notion, Google Docs)
- Design tools (Figma, Adobe Creative Suite)
- CRM and business tools (Salesforce, HubSpot)
- Analytics (Tableau, Power BI)

NEUTRAL applications:
- Browsers (depends on what's accessed)
- System utilities (Finder, File Explorer)
- Calendar and email
- Music (can aid focus)
- General utilities

UNPRODUCTIVE applications:
- Social media (Facebook, Twitter, Instagram, TikTok)
- Entertainment (Netflix, YouTube for non-work)
- Gaming (Steam, Discord for gaming)
- Shopping (Amazon, eBay)

IMPORTANT CONTEXT CONSIDERATIONS:
- Role matters: YouTube might be productive for Marketing but not Finance
- Time of day: Some apps are more acceptable during breaks
- Duration: Long sessions on social media = more unproductive
- Team norms: Some teams may use Discord for work

Respond ONLY with valid JSON:
{
  "classification": "productive" | "neutral" | "unproductive",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of the classification",
  "factors": ["factor1", "factor2", "factor3"]
}`;

export async function classifyApp(analysis: AppAnalysis): Promise<ClassificationResult> {
  const response = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Classify this application:

Application Name: ${analysis.appName}

Usage Statistics:
- Total usage: ${Math.round(analysis.totalUsageMinutes / 60)} hours
- Unique users: ${analysis.uniqueUsers}
- Average session: ${Math.round(analysis.avgDurationPerSession)} minutes

Team Distribution:
${Object.entries(analysis.teamDistribution)
  .map(([team, count]) => `- ${team}: ${count} sessions`)
  .join('\n')}

Role Distribution:
${Object.entries(analysis.roleDistribution)
  .map(([role, count]) => `- ${role}: ${count} sessions`)
  .join('\n')}

Similar Apps Already Classified:
${analysis.existingSimilarApps
  .map((app) => `- ${app.name}: ${app.classification}`)
  .join('\n') || 'None found'}

Based on this data, classify the application.`,
      },
    ],
    { model: MODELS.SMART, temperature: 0.1 }
  );

  try {
    // Extract JSON from response
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr.trim());

    // Validate and normalize
    return {
      classification: normalizeClassification(result.classification),
      confidence: Math.min(Math.max(result.confidence || 0.5, 0), 1),
      reasoning: result.reasoning || 'No reasoning provided',
      factors: result.factors || [],
    };
  } catch (error) {
    console.error('Failed to parse classification response:', response);

    // Return a default with low confidence
    return {
      classification: 'neutral',
      confidence: 0.3,
      reasoning: 'Unable to classify automatically - requires manual review',
      factors: ['parsing_error'],
    };
  }
}

function normalizeClassification(value: string): ProductivityRating {
  const normalized = value?.toLowerCase()?.trim();
  if (normalized === 'productive') return 'productive';
  if (normalized === 'unproductive') return 'unproductive';
  return 'neutral';
}

/**
 * Classify app with role/team context for more specific rules
 */
export async function classifyAppForContext(
  analysis: AppAnalysis,
  context: { teamId?: string; role?: string }
): Promise<ClassificationResult> {
  // Base classification
  const baseResult = await classifyApp(analysis);

  // Adjust confidence based on context match
  if (context.teamId || context.role) {
    // If the app is heavily used by this specific context, increase confidence
    const totalSessions = Object.values(analysis.teamDistribution).reduce(
      (a, b) => a + b,
      0
    );

    // This is simplified - in production you'd have more sophisticated logic
    if (analysis.uniqueUsers > 10 && totalSessions > 100) {
      baseResult.confidence = Math.min(baseResult.confidence + 0.1, 1);
    }
  }

  return baseResult;
}
