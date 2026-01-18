import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const MODELS = {
  // Fast model for quick responses
  FAST: 'llama-3.1-8b-instant',
  // More capable model for complex reasoning
  SMART: 'llama-3.3-70b-versatile',
} as const;

export async function chat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
) {
  const response = await groq.chat.completions.create({
    model: options?.model || MODELS.SMART,
    messages,
    temperature: options?.temperature ?? 0.1,
    max_tokens: options?.maxTokens ?? 2048,
  });

  return response.choices[0]?.message?.content || '';
}
