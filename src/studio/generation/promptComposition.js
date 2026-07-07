// Pure prompt-composition helpers for canvas-driven branch workflows.
// They keep the root prompt, parent prompt, current change request, and
// lineage metadata together so image and video continuations share one shape.

export function buildCanvasContinuationPlan(node, instruction, { mode = 'image', route = '' } = {}) {
  const changePrompt = String(instruction || '').trim();
  const previousPrompt = String(node?.generationPrompt || node?.prompt || '').trim();
  const nextMode = normalizeWorkflowMode(mode, node);
  const nextRoute = route || defaultWorkflowRoute(nextMode);
  if (!previousPrompt) {
    const lineage = changePrompt ? [{ index: 1, mode: nextMode, route: nextRoute, prompt: changePrompt }] : [];
    return {
      mode: nextMode,
      route: nextRoute,
      depth: lineage.length,
      rootPrompt: changePrompt,
      previousPrompt: '',
      changePrompt,
      generationPrompt: changePrompt,
      lineage,
      workflow: changePrompt ? { rootPrompt: changePrompt, lineage } : null
    };
  }

  const workflow = node?.workflow && typeof node.workflow === 'object' ? node.workflow : null;
  const rootPrompt = String(workflow?.rootPrompt || previousPrompt).trim();
  const inheritedLineage = Array.isArray(workflow?.lineage)
    ? workflow.lineage.map(normalizeLineageStep).filter((item) => item.prompt)
    : [];
  const parentLineage = inheritedLineage.length
    ? inheritedLineage
    : [{
      index: 1,
      nodeId: node?.id || '',
      mode: normalizeWorkflowMode(node?.kind || mode, node),
      route: node?.route || '',
      prompt: previousPrompt
    }];
  if (!changePrompt) {
    return {
      mode: nextMode,
      route: nextRoute,
      depth: parentLineage.length,
      rootPrompt,
      previousPrompt,
      changePrompt: '',
      generationPrompt: previousPrompt,
      lineage: parentLineage,
      workflow: { rootPrompt, lineage: parentLineage }
    };
  }

  const nextStep = {
    index: parentLineage.length + 1,
    mode: nextMode,
    route: nextRoute,
    prompt: changePrompt
  };
  const lineage = [...parentLineage, nextStep];
  const generationPrompt = composeContinuationPrompt({
    mode: nextMode,
    rootPrompt,
    previousPrompt,
    changePrompt,
    lineage
  });
  return {
    mode: nextMode,
    route: nextRoute,
    depth: lineage.length,
    rootPrompt,
    previousPrompt,
    changePrompt,
    generationPrompt,
    lineage,
    workflow: { rootPrompt, lineage }
  };
}

export function composeCanvasContinuationPrompt(node, instruction, options = {}) {
  return buildCanvasContinuationPlan(node, instruction, options).generationPrompt;
}

function composeContinuationPrompt({ mode, rootPrompt, previousPrompt, changePrompt, lineage }) {
  const sections = [
    `Root prompt:\n${rootPrompt}`,
    `Previous result prompt to inherit:\n${previousPrompt}`,
    `Next change request:\n${changePrompt}`
  ];
  if (lineage.length > 1) {
    sections.push(`Lineage summary:\n${lineage.map((step) => `#${step.index} ${step.mode}: ${compactPrompt(step.prompt, 220)}`).join('\n')}`);
  }
  sections.push(mode === 'video'
    ? 'Continuity rules:\n- Keep the same subject identity, scene logic, visual style, and important props from the previous result.\n- Apply the new change as the next motion/story beat, not as a full reset.\n- Keep motion stable, coherent, and suitable for the selected video duration.'
    : 'Continuity rules:\n- Keep the same subject identity, composition logic, visual style, materials, lighting, and important props from the previous result.\n- Apply only the new change unless the change explicitly asks for a redesign.\n- Do not add captions, watermarks, UI text, prompt text, or unrelated elements.');
  return sections.join('\n\n').trim();
}

function normalizeLineageStep(step, index) {
  return {
    index: Number(step?.index) || index + 1,
    jobId: String(step?.jobId || '').trim(),
    nodeId: String(step?.nodeId || '').trim(),
    mode: normalizeWorkflowMode(step?.mode),
    route: String(step?.route || '').trim(),
    prompt: String(step?.prompt || '').trim()
  };
}

function normalizeWorkflowMode(mode, node) {
  const value = String(mode || '').trim().toLowerCase();
  if (value === 'video' || node?.kind === 'video') return 'video';
  if (value === 'edit' || value === 'mask') return 'edit';
  return 'image';
}

function defaultWorkflowRoute(mode) {
  if (mode === 'video') return 'video';
  if (mode === 'edit') return 'edits';
  return 'generations';
}

function compactPrompt(value, limit) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!limit || text.length <= limit) return text;
  return text.slice(0, limit);
}
