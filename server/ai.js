const AI_BASE = process.env.PROJECT_OS_AI_BASE || '';
const AI_KEY = process.env.PROJECT_OS_AI_KEY || '';
const AI_MODEL = process.env.PROJECT_OS_AI_MODEL || '';
const EMBEDDING_MODEL = process.env.PROJECT_OS_EMBEDDING_MODEL || '';

export function aiReady() {
  return Boolean(AI_BASE && AI_KEY && AI_MODEL);
}

export async function callAIWithUsage(messages, { temperature = 0.2 } = {}) {
  if (!aiReady()) {
    const err = new Error('The AI service is not configured.');
    err.statusCode = 503;
    throw err;
  }
  const res = await fetch(`${AI_BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      temperature,
    }),
  });
  if (!res.ok) {
    const err = new Error(`AI service request failed: ${res.status}`);
    err.statusCode = 502;
    throw err;
  }
  const data = await res.json();
  return {
    content: data?.choices?.[0]?.message?.content || '',
    usage: data?.usage || null,
  };
}

export async function callAI(messages, options = {}) {
  const result = await callAIWithUsage(messages, options);
  return result.content;
}

export function parseAIJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('The AI response is not valid JSON.');
    return JSON.parse(match[0]);
  }
}

export async function embedText(text) {
  if (!aiReady() || !EMBEDDING_MODEL) {
    const err = new Error('The AI service is not configured.');
    err.statusCode = 503;
    throw err;
  }
  const res = await fetch(`${AI_BASE.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: String(text || '').slice(0, 8000) }),
  });
  if (!res.ok) {
    const err = new Error(`Embedding service request failed: ${res.status}`);
    err.statusCode = 502;
    throw err;
  }
  const data = await res.json();
  return data?.data?.[0]?.embedding || [];
}
