// Pure prompt-composition helpers for the canvas-driven generation flows.
// These own no React state and produce no side effects — they translate
// (selected canvas node, current instruction text) into the prompt string
// that buildGenerationTask will later fingerprint and dispatch. Living in
// the generation domain layer alongside taskBuilder.js so the entire
// "what prompt do we send" decision tree lives in one place.

// Compose the continuation prompt for a canvas child generation: if the
// instruction is empty, fall back to the node's own prompt; if the node
// has no prompt or the instruction already extends it, use the instruction
// as-is; otherwise prefix the parent prompt with a "based on canvas #N"
// continuation header so the model knows it's iterating on a prior result.
export function composeCanvasContinuationPrompt(node, instruction) {
  const currentPrompt = String(instruction || '').trim();
  const parentPrompt = String(node?.prompt || '').trim();
  if (!currentPrompt) return parentPrompt;
  if (!parentPrompt || currentPrompt.startsWith(parentPrompt)) return currentPrompt;
  return `${parentPrompt}\n\n基于画布 #${node?.canvasIndex || ''} 继续优化：\n${currentPrompt}`.trim();
}
