import { getImageProvider, normalizeProviderId } from '../providers/index.js';

const PROVIDER_LIBRARY_KEY = 'image-sub2api-studio:provider-library:v1';
const PROVIDER_SECRET_PREFIX = 'image-sub2api-studio:provider-secret:v1:';

const EMPTY_MODEL_OPTIONS = Object.freeze({ image: [], responses: [], video: [] });

function newProviderId() {
  return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createProviderProfileId() {
  return newProviderId();
}

function trim(value) {
  return String(value || '').trim();
}

function normalizeModelOptions(value) {
  const source = value && typeof value === 'object' ? value : {};
  const normalizeList = (items) => (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') return { id: item, label: item };
      const id = trim(item?.id || item?.name || item?.model);
      return id ? { ...item, id, label: trim(item?.label || id) || id } : null;
    })
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);

  return {
    image: normalizeList(source.image),
    responses: normalizeList(source.responses),
    video: normalizeList(source.video)
  };
}

function inferProviderName(settings) {
  const provider = getImageProvider(settings?.providerId, settings?.apiKeySource);
  const url = trim(settings?.manualGatewayBaseUrl);
  if (url) {
    try {
      return new URL(url).hostname || provider?.label || '我的供应商';
    } catch {
      return url.replace(/^https?:\/\//i, '').split('/')[0] || provider?.label || '我的供应商';
    }
  }
  return provider?.label || '我的供应商';
}

export function providerProfileFromSettings(settings = {}, options = {}) {
  const id = trim(options.id || settings.providerProfileId) || newProviderId();
  return {
    id,
    name: trim(options.name || settings.providerName) || inferProviderName(settings),
    providerId: normalizeProviderId(settings.providerId, settings.apiKeySource),
    apiKeySource: settings.apiKeySource === 'manual' ? 'manual' : 'gateway',
    route: trim(settings.route) || 'auto',
    manualGatewayBaseUrl: trim(settings.manualGatewayBaseUrl),
    imageGenerationModel: trim(settings.imageGenerationModel),
    imageEditModel: trim(settings.imageEditModel),
    videoModel: trim(settings.videoModel),
    videoGatewayBaseUrl: trim(settings.videoGatewayBaseUrl),
    responsesModel: trim(settings.responsesModel),
    partialImages: Number.isFinite(Number(settings.partialImages)) ? Number(settings.partialImages) : 2,
    modelOptions: normalizeModelOptions(options.modelOptions || settings.modelOptions)
  };
}

export function providerSettingsFromProfile(profile) {
  if (!profile) return null;
  return {
    providerProfileId: profile.id,
    providerId: profile.providerId,
    apiKeySource: profile.apiKeySource,
    route: profile.route,
    manualApiKey: readProviderSecret(profile.id),
    manualGatewayBaseUrl: profile.manualGatewayBaseUrl,
    imageGenerationModel: profile.imageGenerationModel,
    imageEditModel: profile.imageEditModel,
    videoModel: profile.videoModel,
    videoGatewayBaseUrl: profile.videoGatewayBaseUrl,
    responsesModel: profile.responsesModel,
    partialImages: profile.partialImages
  };
}

function readStoredLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROVIDER_LIBRARY_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.profiles)) return null;
    const profiles = parsed.profiles
      .map((profile) => providerProfileFromSettings(profile, { id: profile.id, name: profile.name, modelOptions: profile.modelOptions }))
      .filter((profile, index, list) => profile.id && list.findIndex((candidate) => candidate.id === profile.id) === index);
    if (!profiles.length) return null;
    const activeProfileId = profiles.some((profile) => profile.id === parsed.activeProfileId)
      ? parsed.activeProfileId
      : profiles[0].id;
    return { profiles, activeProfileId };
  } catch {
    return null;
  }
}

export function saveProviderLibrary(library) {
  const profiles = Array.isArray(library?.profiles) ? library.profiles : [];
  const activeProfileId = library?.activeProfileId || profiles[0]?.id || '';
  const payload = {
    activeProfileId,
    profiles: profiles.map((profile) => providerProfileFromSettings(profile, {
      id: profile.id,
      name: profile.name,
      modelOptions: profile.modelOptions
    }))
  };
  localStorage.setItem(PROVIDER_LIBRARY_KEY, JSON.stringify(payload));
  return payload;
}

export function loadProviderLibrary(fallbackSettings = {}) {
  const stored = readStoredLibrary();
  if (stored) return stored;

  const profile = providerProfileFromSettings(fallbackSettings, {
    id: fallbackSettings.providerProfileId,
    name: fallbackSettings.providerName,
    modelOptions: fallbackSettings.modelOptions
  });
  writeProviderSecret(profile.id, fallbackSettings.manualApiKey);
  return saveProviderLibrary({ profiles: [profile], activeProfileId: profile.id });
}

export function upsertProviderProfile(library, { id, name, settings, modelOptions } = {}) {
  const currentProfiles = Array.isArray(library?.profiles) ? library.profiles : [];
  const existing = currentProfiles.find((profile) => profile.id === id);
  const profile = providerProfileFromSettings(settings, {
    id: id || newProviderId(),
    name: name || existing?.name,
    modelOptions: modelOptions || existing?.modelOptions
  });
  writeProviderSecret(profile.id, settings?.manualApiKey);
  const profiles = existing
    ? currentProfiles.map((item) => item.id === profile.id ? profile : item)
    : [...currentProfiles, profile];
  return saveProviderLibrary({
    profiles,
    activeProfileId: library?.activeProfileId || profile.id
  });
}

export function deleteProviderProfile(library, profileId) {
  const profiles = (library?.profiles || []).filter((profile) => profile.id !== profileId);
  removeProviderSecret(profileId);
  return saveProviderLibrary({
    profiles,
    activeProfileId: library?.activeProfileId === profileId ? (profiles[0]?.id || '') : library?.activeProfileId
  });
}

export function writeProviderSecret(profileId, value) {
  try {
    const key = `${PROVIDER_SECRET_PREFIX}${encodeURIComponent(profileId)}`;
    const secret = String(value || '');
    if (secret) sessionStorage.setItem(key, secret);
    else sessionStorage.removeItem(key);
  } catch {
    // Session-only secrets are optional for boot and can be re-entered.
  }
}

export function readProviderSecret(profileId) {
  try {
    return sessionStorage.getItem(`${PROVIDER_SECRET_PREFIX}${encodeURIComponent(profileId)}`) || '';
  } catch {
    return '';
  }
}

function removeProviderSecret(profileId) {
  try {
    sessionStorage.removeItem(`${PROVIDER_SECRET_PREFIX}${encodeURIComponent(profileId)}`);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function modelOptionsForProfile(profile) {
  return normalizeModelOptions(profile?.modelOptions || EMPTY_MODEL_OPTIONS);
}
