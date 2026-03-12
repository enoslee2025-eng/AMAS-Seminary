import { LibraryResource, LibraryRuntimeRecord, LibraryRuntimeState } from '../../types/app';

export function createInitialLibraryRuntime(resources: LibraryResource[]): LibraryRuntimeRecord {
  return resources.reduce<LibraryRuntimeRecord>((accumulator, resource) => {
    accumulator[resource.id] = {
      favorite: false,
      viewed: false,
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

export function getLibraryOverview(runtimeRecord: LibraryRuntimeRecord) {
  const values = Object.values(runtimeRecord);
  return {
    favoriteCount: values.filter((item) => item?.favorite).length,
    viewedCount: values.filter((item) => item?.viewed).length,
    downloadedCount: values.filter((item) => item?.downloaded).length,
  };
}
