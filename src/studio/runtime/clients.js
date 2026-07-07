// Runtime client boundary for the browser workstation.
// UI code should ask this module for clients instead of constructing gateway
// or history clients directly. That keeps transport/client choices out of
// studio.jsx and gives adapter changes one place to hook into later.

import { AiGatewayClient, StudioHistoryClient } from '../../aiGatewayClient.js';

export function createGatewayClient({ session = null, providerSettings } = {}) {
  return new AiGatewayClient({ session, providerSettings });
}

export function createHistoryClient({ session = null } = {}) {
  return new StudioHistoryClient({ session });
}
