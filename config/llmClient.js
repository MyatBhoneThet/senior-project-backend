// backend/config/llmClient.js
const OpenAI = require('openai');

function makeLLMClient() {
  const provider = (process.env.LLM_PROVIDER || 'github').toLowerCase();

  if (provider === 'github') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set');
    const baseURL = process.env.GITHUB_MODELS_BASE_URL || 'https://models.github.ai/inference';
    const model = process.env.LLM_MODEL || 'openai/gpt-4o-mini';
    const client = new OpenAI({ apiKey: token, baseURL });
    return { client, model, provider };
  }

  // Fallback: OpenAI native (if you ever want to flip back)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set (LLM_PROVIDER=openai)');
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const client = new OpenAI({ apiKey });
  return { client, model, provider };
}

module.exports = { makeLLMClient };
