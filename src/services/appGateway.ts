import { AppServiceContracts } from './appContracts';
import { createHttpAppGateway } from './httpAppGateway';
import { localAppGateway } from './localAppGateway';

export type AppGatewayInfo = {
  mode: 'local' | 'remote';
  reason: string;
};

const requestedMode = import.meta.env.VITE_APP_GATEWAY_MODE === 'remote' ? 'remote' : 'local';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';

export const appGatewayInfo: AppGatewayInfo =
  requestedMode === 'remote' && apiBaseUrl
    ? {
        mode: 'remote',
        reason: `HTTP gateway -> ${apiBaseUrl}`,
      }
    : requestedMode === 'remote'
      ? {
          mode: 'local',
          reason: 'Missing VITE_API_BASE_URL, fallback to local gateway',
        }
      : {
          mode: 'local',
          reason: 'Local gateway active',
        };

export const appGateway: AppServiceContracts =
  appGatewayInfo.mode === 'remote' ? createHttpAppGateway(apiBaseUrl) : localAppGateway;
