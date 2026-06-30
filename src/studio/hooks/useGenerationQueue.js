// useGenerationQueue — owns the queue state and the bookkeeping refs that
// surround it. The various commit/recover/cancel handlers stay in
// CreationDesk because they cross-cut session persistence and remote sync,
// but they now read/write through this hook so the queue's storage shape
// is decoupled from the desk's render code.

import { useRef, useState } from 'react';

export function useGenerationQueue(restoredSession) {
  const initialQueue = Array.isArray(restoredSession?.generationQueue)
    ? restoredSession.generationQueue
    : [];
  const [generationQueue, setGenerationQueue] = useState(() => initialQueue);
  const generationQueueRef = useRef(initialQueue);
  const generationQueueRunnerRef = useRef(false);
  const restoredQueueStartedRef = useRef(false);
  const recoveredJobIdsRef = useRef(new Set());

  return {
    generationQueue,
    setGenerationQueue,
    generationQueueRef,
    generationQueueRunnerRef,
    restoredQueueStartedRef,
    recoveredJobIdsRef
  };
}
