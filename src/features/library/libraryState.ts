import { LibraryResource, LibraryRuntimeRecord, LibraryRuntimeState } from '../../types/app';

export function clampLibraryProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function getLibraryProgressLabel(progressPercent: number) {
  const normalized = clampLibraryProgress(progressPercent);

  if (normalized >= 100) {
    return '已完成';
  }

  if (normalized >= 75) {
    return '接近完成';
  }

  if (normalized >= 40) {
    return '阅读中';
  }

  if (normalized > 0) {
    return '刚开始';
  }

  return '未开始';
}

export function createInitialLibraryRuntime(resources: LibraryResource[]): LibraryRuntimeRecord {
  return resources.reduce<LibraryRuntimeRecord>((accumulator, resource) => {
    accumulator[resource.id] = {
      favorite: false,
      viewed: false,
      progressPercent: 0,
      downloaded: false,
      lastViewedAt: null,
    };
    return accumulator;
  }, {});
}

export function getLibraryRuntime(resourceId: string, runtimeRecord: LibraryRuntimeRecord): LibraryRuntimeState {
  return (
    runtimeRecord[resourceId] ?? {
      favorite: false,
      viewed: false,
      progressPercent: 0,
      downloaded: false,
      lastViewedAt: null,
    }
  );
}

export function getRecentViewedResources(
  resources: LibraryResource[],
  runtimeRecord: LibraryRuntimeRecord,
  limit = 3,
): LibraryResource[] {
  return resources
    .filter((resource) => runtimeRecord[resource.id]?.lastViewedAt)
    .sort((left, right) => {
      const leftTime = runtimeRecord[left.id]?.lastViewedAt ? new Date(runtimeRecord[left.id].lastViewedAt as string).getTime() : 0;
      const rightTime = runtimeRecord[right.id]?.lastViewedAt ? new Date(runtimeRecord[right.id].lastViewedAt as string).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);
}

export function getDownloadedResources(
  resources: LibraryResource[],
  runtimeRecord: LibraryRuntimeRecord,
  limit?: number,
): LibraryResource[] {
  const downloadedResources = resources
    .filter((resource) => runtimeRecord[resource.id]?.downloaded)
    .sort((left, right) => {
      const leftTime = runtimeRecord[left.id]?.lastViewedAt ? new Date(runtimeRecord[left.id].lastViewedAt as string).getTime() : 0;
      const rightTime = runtimeRecord[right.id]?.lastViewedAt ? new Date(runtimeRecord[right.id].lastViewedAt as string).getTime() : 0;
      return rightTime - leftTime;
    });

  return typeof limit === 'number' ? downloadedResources.slice(0, limit) : downloadedResources;
}

export function getInProgressResources(
  resources: LibraryResource[],
  runtimeRecord: LibraryRuntimeRecord,
  limit = 3,
): LibraryResource[] {
  return resources
    .filter((resource) => {
      const progressPercent = runtimeRecord[resource.id]?.progressPercent ?? 0;
      return progressPercent > 0 && progressPercent < 100;
    })
    .sort((left, right) => {
      const leftTime = runtimeRecord[left.id]?.lastViewedAt ? new Date(runtimeRecord[left.id].lastViewedAt as string).getTime() : 0;
      const rightTime = runtimeRecord[right.id]?.lastViewedAt ? new Date(runtimeRecord[right.id].lastViewedAt as string).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);
}

export function getLibraryOverview(runtimeRecord: LibraryRuntimeRecord) {
  const values = Object.values(runtimeRecord);
  return {
    favoriteCount: values.filter((item) => item?.favorite).length,
    viewedCount: values.filter((item) => item?.viewed).length,
    inProgressCount: values.filter((item) => {
      const progressPercent = item?.progressPercent ?? 0;
      return progressPercent > 0 && progressPercent < 100;
    }).length,
    downloadedCount: values.filter((item) => item?.downloaded).length,
  };
}
