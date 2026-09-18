/**
 * llmProvider.ts — Provider-neutral LLM call.
 *
 * The platform's AI engine talks to an OpenAI-compatible chat completions
 * endpoint. Configured via env so it works with:
 *   - OpenAI (platform.openai.com):  OPENAI_AUTH_STYLE=bearer (default)
 *   - Azure OpenAI / institutional gateways:
 *       OPENAI_BASE_URL=https://<resource>.openai.azure.com/openai/deployments/<deployment>
 *       OPENAI_AUTH_STYLE=api-key
 *       OPENAI_API_VERSION=2024-02-01
 *
 * The API key is never exposed to the browser — all calls are server-side.
 * Mock responses (LLM_MODE=mock) are handled by the caller via mockAi.ts.
 */
import axios from 'axios';

export interface ChatMessage { role: string; content: string }

export async function callModel(
  systemPrompt: string,
  messages: ChatMessage[],
  opts: { maxTokens?: number } = {},
): Promise<string> {
  const baseUrl   = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey    = process.env.OPENAI_API_KEY!;
  const authStyle = process.env.OPENAI_AUTH_STYLE ?? 'bearer';
  const apiVersion = process.env.OPENAI_API_VERSION;

  const url = `${baseUrl}/chat/completions${apiVersion ? `?api-version=${apiVersion}` : ''}`;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authStyle === 'api-key') headers['api-key'] = apiKey;
  else headers['Authorization'] = `Bearer ${apiKey}`;

  const resp = await axios.post(url, {
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    ],
    max_tokens:  opts.maxTokens ?? 1024,
    temperature: 0.7,
  }, { headers, timeout: 30_000 });

  return resp.data.choices?.[0]?.message?.content ?? '';
}
