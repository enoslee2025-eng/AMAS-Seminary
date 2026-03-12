import { AppBackupPayload, CourseRuntimeRecord, LibraryRuntimeRecord, ProfileState } from '../types/app';

const BACKUP_VERSION = 1;

export function createAppBackupPayload({
  profile,
  courseRuntime,
  libraryRuntime,
}: {
  profile: ProfileState;
  courseRuntime: CourseRuntimeRecord;
  libraryRuntime: LibraryRuntimeRecord;
}): AppBackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    courseRuntime,
    libraryRuntime,
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

  if (!isAppBackupPayload(parsed)) {
    throw new Error('备份文件格式无效，请重新选择导出的 JSON 存档。');
  }

  return parsed;
}

function isAppBackupPayload(value: unknown): value is AppBackupPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === BACKUP_VERSION &&
    typeof value.exportedAt === 'string' &&
    isProfileState(value.profile) &&
    isCourseRuntimeRecord(value.courseRuntime) &&
    isLibraryRuntimeRecord(value.libraryRuntime)
  );
}

function isProfileState(value: unknown): value is ProfileState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === 'string' &&
    typeof value.role === 'string' &&
    typeof value.bio === 'string' &&
    typeof value.email === 'string' &&
    typeof value.location === 'string'
  );
}

function isCourseRuntimeRecord(value: unknown): value is CourseRuntimeRecord {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      (item.currentLessonId === null || typeof item.currentLessonId === 'string') &&
      isStringArray(item.completedLessonIds) &&
      isStringArray(item.viewedMaterialIds) &&
      (item.lastStudiedAt === null || typeof item.lastStudiedAt === 'string') &&
      (item.lastOpenedTab === 'overview' || item.lastOpenedTab === 'syllabus' || item.lastOpenedTab === 'materials')
    );
  });
}

function isLibraryRuntimeRecord(value: unknown): value is LibraryRuntimeRecord {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      typeof item.favorite === 'boolean' &&
      typeof item.viewed === 'boolean' &&
      typeof item.downloaded === 'boolean' &&
      (item.lastViewedAt === null || typeof item.lastViewedAt === 'string')
    );
  });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
