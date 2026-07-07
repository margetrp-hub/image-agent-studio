export async function fillGenerationPrompt(page, prompt) {
  const singlePrompt = page.locator('.singlePromptBox textarea').first();
  if (await singlePrompt.isVisible().catch(() => false)) {
    await singlePrompt.fill(prompt);
    return 'single';
  }

  const composerPrompt = page.locator('.bottomComposerInput textarea').first();
  if (await composerPrompt.isVisible().catch(() => false)) {
    await composerPrompt.fill(prompt);
    return 'canvas';
  }

  throw new Error('Could not find a visible generation prompt input.');
}

export async function clickGenerate(page) {
  const singleGenerate = page.locator('.singleGenerateButton').first();
  if (await singleGenerate.isVisible().catch(() => false)) {
    await singleGenerate.click();
    return 'single';
  }

  const composerGenerate = page.locator('.composerGenerateAction').first();
  if (await composerGenerate.isVisible().catch(() => false)) {
    await composerGenerate.click();
    return 'canvas';
  }

  throw new Error('Could not find a visible generation action button.');
}

export async function uploadReferenceImage(page, filePath) {
  const singleUploadDrop = page.locator('.singleUploadDrop').first();
  if (await singleUploadDrop.isVisible().catch(() => false)) {
    await singleUploadDrop.locator('input[type="file"]').setInputFiles(filePath);
    return 'single';
  }

  const sideUpload = page.locator('.referenceSidePanel input[type="file"]').first();
  if (await sideUpload.count()) {
    await sideUpload.setInputFiles(filePath);
    return 'side-panel';
  }

  throw new Error('Could not find a reference image upload input.');
}
