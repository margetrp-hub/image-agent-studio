// Provider/key display helpers shared between studio.jsx and the extracted
// settings UI. Pure functions — no React, no DOM.

import { getConfiguredBaseUrls } from '../../aiGatewayClient';
import { getImageProvider } from '../providers/index.js';

export function maskApiKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (/[*•]/.test(key) || key.includes('...')) return key;
  if (key.length <= 8) return `${key.slice(0, 2)}...${key.slice(-2)}`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export function apiKeyDisplay(apiKey) {
  const display = apiKey?.displayKey || apiKey?.key || apiKey?.plain || apiKey?.mask;
  return display ? maskApiKey(display) : apiKey?.name || '选择密钥';
}

export function apiKeyMeta(apiKey) {
  const scope = apiKey?.scope || '默认权限';
  const status = apiKey?.status === 1 || String(apiKey?.status || '').toLowerCase() === 'active' ? '可用' : apiKey?.status || '可用';
  return `${status} · ${scope}`;
}

export function usesGatewayAccount(settings) {
  return settings?.apiKeySource !== 'manual';
}

export function defaultProviderGatewayBaseUrl(settings) {
  if (settings?.providerId === 'official-openai') return 'https://api.openai.com/v1';
  return getConfiguredBaseUrls().gatewayBaseUrl;
}

export function providerLabel(settings, apiKey) {
  const provider = getImageProvider(settings.providerId, settings.apiKeySource);
  if (settings.apiKeySource === 'manual') return provider?.label || (settings.manualGatewayBaseUrl ? 'Custom API' : 'Manual provider');
  return apiKey?.name || provider?.label || 'Gateway Account';
}
