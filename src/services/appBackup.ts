import {
  AppBackupPayload,
  AppBackupSnapshot,
  AppDomainSnapshot,
  LegacyAppBackupPayload,
} from '../types/app';
import { createDefaultAppDomainSnapshot, normalizeAppDomainSnapshot } from './appRepository';

const BACKUP_VERSION = 2;

function buildBackupSnapshot(snapshot: AppDomainSnapshot): AppBackupSnapshot {
  const normalized = normalizeAppDomainSnapshot(snapshot);

  return {
    ...normalized,
    authSession: null,
  };
}

export function createAppBackupPayload(snapshot: AppDomainSnapshot): AppBackupPayload {
  return {
    version: BACKUP_VERSION,
    scope: 'full_snapshot',
    exportedAt: new Date().toISOString(),
    snapshot: buildBackupSnapshot(snapshot),
  };
}

export function downloadAppBackup(payload: AppBackupPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `amas-backup-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function parseAppBackupFile(file: File): Promise<AppBackupPayload> {
  const parsed = JSON.parse(await file.text()) as unknown;

  const normalized = normalizeBackupPayload(parsed);
  if (!normalized) {
    throw new Error('备份文件格式无效，请重新选择导出的 JSON 存档。');
  }

  return normalized;
}

function normalizeBackupPayload(value: unknown): AppBackupPayload | null {
  if (isAppBackupPayload(value)) {
    return {
      version: BACKUP_VERSION,
      scope: 'full_snapshot',
      exportedAt: value.exportedAt,
      snapshot: buildBackupSnapshot(value.snapshot),
    };
  }

  if (isLegacyAppBackupPayload(value)) {
    const fallback = createDefaultAppDomainSnapshot();

    return {
      version: BACKUP_VERSION,
      scope: 'legacy_partial',
      exportedAt: value.exportedAt,
      snapshot: buildBackupSnapshot({
        ...fallback,
        profile: value.profile,
        courseRuntime: value.courseRuntime,
        libraryRuntime: value.libraryRuntime,
      }),
    };
  }

  return null;
}

function isAppBackupPayload(value: unknown): value is AppBackupPayload {
  return (
    isRecord(value) &&
    value.version === BACKUP_VERSION &&
    (value.scope === 'full_snapshot' || value.scope === 'legacy_partial') &&
    typeof value.exportedAt === 'string' &&
    isRecord(value.snapshot)
  );
}

function isLegacyAppBackupPayload(value: unknown): value is LegacyAppBackupPayload {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.exportedAt === 'string' &&
    isRecord(value.profile) &&
    isRecord(value.courseRuntime) &&
    isRecord(value.libraryRuntime)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
