// Predicates that classify a session's worth of saved state — used to decide
// whether the canvas has anything worth restoring on load, or whether a queue
// item still has restorable server-side generation work.

// Returns true if the session has anything a user would notice losing — a
// prompt, results, queued generations, or assistant chatter. Used to gate the
// "do you want to restore your last canvas?" prompt on cold load.
export function hasMeaningfulSessionContent(session) {
  if (!session || typeof session !== 'object') return false;
  return Boolean(
    String(session.prompt || '').trim()
    || (Array.isArray(session.results) && session.results.length)
    || (Array.isArray(session.videoResults) && session.videoResults.length)
    || (Array.isArray(session.canvasNodes) && session.canvasNodes.length)
    || (Array.isArray(session.generationQueue) && session.generationQueue.length)
    || (Array.isArray(session.assistantMessages) && session.assistantMessages.length)
  );
}

// Returns true if the session has any in-flight generation jobs whose server
// state can still be polled. `isRestorableQueueItem` is injected so this
// module stays free of generation-job details.
export function hasRestorableServerGeneration(session, isRestorableQueueItem) {
  return Array.isArray(session?.generationQueue)
    && session.generationQueue.some(isRestorableQueueItem);
}
