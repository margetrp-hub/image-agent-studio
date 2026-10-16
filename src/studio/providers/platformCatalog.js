const CAPABILITIES = { image: 'textToImage', edit: 'imageEdit', video: 'videoGeneration' };

export function platformModelSupports(model, operation) {
  const price = model?.prices?.[operation];
  return model?.enabled === true && model?.available === true && model?.supported === true
    && model.capabilities?.[CAPABILITIES[operation]] === true
    && Number.isSafeInteger(price) && price >= 0 && price <= 10000000;
}

export function platformPriceLabel(model, operation, count = 1) {
  if (!platformModelSupports(model, operation)) return '当前操作不可用';
  const price = model.prices[operation];
  const quantity = operation === 'video' ? 1 : count;
  return `${price} 积分/${operation === 'video' ? '任务' : '张'}${quantity > 1 ? `，合计 ${price * quantity} 积分` : ''}`;
}

export function platformModelOptions(provider) {
  const models = (provider?.models || []).map((model) => ({ ...model, platformProviderId: provider.id, label: model.name || model.id }));
  return {
    image: models.filter((model) => platformModelSupports(model, 'image') || platformModelSupports(model, 'edit')),
    video: models.filter((model) => platformModelSupports(model, 'video')),
    responses: []
  };
}

export function platformProviderSettings(provider) {
  return {
    apiKeySource: 'platform',
    platformProviderId: provider.id,
    providerProfileId: '',
    providerId: provider.providerId,
    providerName: provider.name,
    manualApiKey: '',
    manualGatewayBaseUrl: '',
    videoGatewayBaseUrl: '',
    imageGenerationModel: '',
    imageEditModel: '',
    videoModel: '',
    route: 'auto'
  };
}
