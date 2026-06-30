// Creative recipes are user-facing prompt presets shown in the composer
// "配方增强" bar. Each recipe carries a tone hint plus default size / quality /
// resolution-tier metadata that the composer applies when the recipe is picked.

export const CREATIVE_RECIPES = [
  {
    id: 'commerce-main',
    title: '电商主图',
    tone: '干净成交',
    size: '1024x1024',
    quality: 'high',
    resolutionTier: '2k',
    prompt: '商业产品摄影，主体居中，纯净浅色背景，柔和棚拍灯光，边缘高光清晰，材质纹理可见，留出少量促销文字空间，适合电商主图。'
  },
  {
    id: 'lifestyle-scene',
    title: '生活场景',
    tone: '真实氛围',
    size: '1024x1536',
    quality: 'high',
    resolutionTier: '2k',
    prompt: '生活方式摄影，把主体放在真实使用场景中，自然窗光，浅景深，温暖但克制的色彩，画面有故事感，像高端品牌社媒内容。'
  },
  {
    id: 'brand-poster',
    title: '品牌海报',
    tone: '强视觉',
    size: '1024x1536',
    quality: 'high',
    resolutionTier: '4k',
    prompt: '品牌视觉海报，强构图层级，清晰主标题留白区，主体与图形元素形成对角线动势，高级商业广告质感，适合活动推广。'
  },
  {
    id: 'ui-mockup',
    title: '界面样机',
    tone: '产品展示',
    size: '1536x1024',
    quality: 'medium',
    resolutionTier: '2k',
    prompt: '现代产品界面样机，真实设备或浏览器框架，界面信息清楚可读，背景简洁，光影克制，突出工作流和关键操作状态。'
  },
  {
    id: 'character-sheet',
    title: '角色设定',
    tone: '一致形象',
    size: '1024x1536',
    quality: 'high',
    resolutionTier: '2k',
    prompt: '角色设定图，同一角色的正面姿态，服装、配饰、表情特征清晰，干净背景，适合作为后续图像一致性参考。'
  },
  {
    id: 'editorial-cover',
    title: '封面大片',
    tone: '杂志感',
    size: '1024x1536',
    quality: 'high',
    resolutionTier: '4k',
    prompt: '杂志封面摄影，强烈但自然的主视觉，人物或主体占据第一视线，背景有层次，保留标题区，色彩具有高级编辑感。'
  }
];

export const CREATIVE_RECIPE_PREFIX = '配方增强：';

export function stripCreativeRecipePrompt(value) {
  let next = String(value || '').trim();
  if (!next) return '';
  for (const recipe of CREATIVE_RECIPES) {
    if (next === recipe.prompt) return '';
    const markedPrompt = `${CREATIVE_RECIPE_PREFIX}${recipe.prompt}`;
    while (next.includes(markedPrompt)) {
      next = next
        .replace(`\n\n${markedPrompt}`, '')
        .replace(`\n${markedPrompt}`, '')
        .replace(markedPrompt, '')
        .trim();
    }
  }
  return next;
}
