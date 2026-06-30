// Parsers for the assistant / prompt-optimizer reply payloads. The backend
// streams back JSON (sometimes wrapped in ```json fences); these helpers
// unwrap, parse, and coerce into the shape the studio UI consumes.
// Pure: no React, no DOM, no module-level state.

function stripCodeFence(text) {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

export function parseOptimizedPrompt(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const jsonText = stripCodeFence(raw);
  try {
    const parsed = JSON.parse(jsonText);
    return {
      subject: parsed.subject || '',
      scene: parsed.scene || '',
      composition: parsed.composition || '',
      style: parsed.style || '',
      lighting: parsed.lighting || '',
      details: parsed.details || '',
      textRules: parsed.textRules || '',
      constraints: parsed.constraints || '',
      finalPrompt: parsed.finalPrompt || raw,
      raw
    };
  } catch {
    return { finalPrompt: raw, raw };
  }
}

export function parseAssistantReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const jsonText = stripCodeFence(raw);
  try {
    const parsed = JSON.parse(jsonText);
    return {
      reply: parsed.reply || parsed.message || raw,
      finalPrompt: parsed.finalPrompt || parsed.prompt || '',
      raw
    };
  } catch {
    return {
      reply: raw,
      finalPrompt: '',
      raw
    };
  }
}
