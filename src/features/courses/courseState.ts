import { libraryResources } from '../../data/mockData';
import { CourseDetailTab, CourseItem, CourseMaterial, CourseRuntimeRecord, CourseRuntimeState, LibraryRuntimeRecord } from '../../types/app';
import { clampLibraryProgress, getLibraryProgressLabel, getLibraryRuntime } from '../library/libraryState';

export type CourseLinkedResourceAction = {
  resourceId: string;
  resourceTitle: string;
  progressPercent: number;
  progressLabel: string;
  downloaded: boolean;
  meta: string;
  ctaLabel: string;
};

export type CourseRecentActivity = {
  at: string | null;
  label: string;
  source: 'course' | 'resource' | null;
  detail: string;
  resourceId?: string;
  resourceTitle?: string;
};

export type DisplayCourse = CourseItem & {
  runtime: CourseRuntimeState;
  progressValue: number;
  completedLessonsCount: number;
  viewedMaterialsCount: number;
  linkedMaterialsCount: number;
  inProgressMaterialsCount: number;
  downloadedMaterialsCount: number;
  primaryLinkedResource: CourseLinkedResourceAction | null;
  lastActivityAt: string | null;
  lastActivitySource: CourseRecentActivity['source'];
  lastActivityDetail: string;
  lastActivityResourceId?: string;
  lastActivityResourceTitle?: string;
  recentLessonLabel: string;
  lastStudiedLabel: string;
};

export type LearningOverview = {
  activeCourseCount: number;
  completedLessonCount: number;
  viewedMaterialCount: number;
  linkedMaterialCount: number;
  inProgressMaterialCount: number;
  downloadedMaterialCount: number;
  recentCourseId: string | null;
  recentCourseTitle: string;
};

export type CourseMaterialStatus = {
  viewed: boolean;
  downloaded: boolean;
  progressPercent: number;
  progressLabel: string;
  linkedResourceId: string | null;
};

export type CourseMaterialsOverview = {
  viewedCount: number;
  linkedCount: number;
  inProgressCount: number;
  downloadedCount: number;
};

function getLinkedResourcePriority(progressPercent: number, downloaded: boolean, viewed: boolean) {
  if (progressPercent > 0 && progressPercent < 100) {
    return 4;
  }

  if (downloaded) {
    return 3;
  }

  if (viewed || progressPercent >= 100) {
    return 2;
  }

  return 1;
}

function getLatestLinkedResourceActivity(
  course: CourseItem,
  runtime: CourseRuntimeState,
  libraryRuntimeRecord: LibraryRuntimeRecord,
) {
  return course.materials
    .map((material) => {
      if (!material.libraryResourceId) {
        return null;
      }

      const resource = libraryResources.find((item) => item.id === material.libraryResourceId) ?? null;
      const linkedRuntime = resource ? getLibraryRuntime(material.libraryResourceId, libraryRuntimeRecord) : null;
      if (!resource || !linkedRuntime?.lastViewedAt) {
        return null;
      }

      const status = getCourseMaterialStatus(material, runtime, libraryRuntimeRecord);
      return {
        resource,
        status,
        lastViewedAt: linkedRuntime.lastViewedAt,
        sortValue: new Date(linkedRuntime.lastViewedAt).getTime(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.sortValue - left.sortValue)[0] ?? null;
}

function stampRuntime(runtime: CourseRuntimeState): CourseRuntimeState {
  return {
    ...runtime,
    lastStudiedAt: new Date().toISOString(),
  };
}

export function createInitialCourseRuntime(courses: CourseItem[]): CourseRuntimeRecord {
  return courses.reduce<CourseRuntimeRecord>((accumulator, course) => {
    const completedLessonIds = course.syllabus.filter((lesson) => lesson.completed).map((lesson) => lesson.id);

    accumulator[course.id] = {
      currentLessonId: course.syllabus.find((lesson) => !lesson.completed)?.id ?? course.syllabus[0]?.id ?? null,
      completedLessonIds,
      viewedMaterialIds: [],
      lastStudiedAt: null,
      lastOpenedTab: 'overview',
    };
    return accumulator;
  }, {});
}

export function getCourseRuntime(course: CourseItem, record: CourseRuntimeRecord): CourseRuntimeState {
  const fallback = createInitialCourseRuntime([course])[course.id];
  const runtime = record[course.id];

  if (!runtime) {
    return fallback;
  }

  return {
    currentLessonId: runtime.currentLessonId ?? fallback.currentLessonId,
    completedLessonIds: Array.from(new Set(runtime.completedLessonIds ?? fallback.completedLessonIds)),
    viewedMaterialIds: Array.from(new Set(runtime.viewedMaterialIds ?? [])),
    lastStudiedAt: runtime.lastStudiedAt ?? null,
    lastOpenedTab: runtime.lastOpenedTab ?? fallback.lastOpenedTab,
  };
}

export function calculateCourseProgress(course: CourseItem, runtime: CourseRuntimeState): number {
  if (course.syllabus.length === 0) {
    return 0;
  }

  return Math.round((runtime.completedLessonIds.length / course.syllabus.length) * 100);
}

export function getCompletedLessonsCount(runtime: CourseRuntimeState): number {
  return runtime.completedLessonIds.length;
}

export function getCourseMaterialStatus(
  material: CourseMaterial,
  runtime: CourseRuntimeState,
  libraryRuntimeRecord: LibraryRuntimeRecord = {},
): CourseMaterialStatus {
  const linkedRuntime = material.libraryResourceId ? getLibraryRuntime(material.libraryResourceId, libraryRuntimeRecord) : null;
  const progressPercent = clampLibraryProgress(linkedRuntime?.progressPercent ?? 0);
  const viewedFromLibrary = Boolean(
    linkedRuntime?.viewed || linkedRuntime?.downloaded || linkedRuntime?.lastViewedAt || progressPercent > 0,
  );

  return {
    viewed: runtime.viewedMaterialIds.includes(material.id) || viewedFromLibrary,
    downloaded: Boolean(linkedRuntime?.downloaded),
    progressPercent,
    progressLabel: getLibraryProgressLabel(progressPercent),
    linkedResourceId: material.libraryResourceId ?? null,
  };
}

export function getViewedMaterialsCount(
  course: CourseItem,
  runtime: CourseRuntimeState,
  libraryRuntimeRecord: LibraryRuntimeRecord = {},
): number {
  return getCourseMaterialsOverview(course, runtime, libraryRuntimeRecord).viewedCount;
}

export function getCourseMaterialsOverview(
  course: CourseItem,
  runtime: CourseRuntimeState,
  libraryRuntimeRecord: LibraryRuntimeRecord = {},
): CourseMaterialsOverview {
  return course.materials.reduce<CourseMaterialsOverview>(
    (summary, material) => {
      const status = getCourseMaterialStatus(material, runtime, libraryRuntimeRecord);

      if (status.viewed) {
        summary.viewedCount += 1;
      }

      if (status.linkedResourceId) {
        summary.linkedCount += 1;
      }

      if (status.progressPercent > 0 && status.progressPercent < 100) {
        summary.inProgressCount += 1;
      }

      if (status.downloaded) {
        summary.downloadedCount += 1;
      }

      return summary;
    },
    {
      viewedCount: 0,
      linkedCount: 0,
      inProgressCount: 0,
      downloadedCount: 0,
    },
  );
}

export function getCoursePrimaryLinkedResource(
  course: CourseItem,
  runtime: CourseRuntimeState,
  libraryRuntimeRecord: LibraryRuntimeRecord = {},
): CourseLinkedResourceAction | null {
  const candidates = course.materials
    .map((material) => {
      if (!material.libraryResourceId) {
        return null;
      }

      const resource = libraryResources.find((item) => item.id === material.libraryResourceId) ?? null;
      if (!resource) {
        return null;
      }

      const status = getCourseMaterialStatus(material, runtime, libraryRuntimeRecord);
      const linkedRuntime = getLibraryRuntime(resource.id, libraryRuntimeRecord);
      const lastViewedAt = linkedRuntime.lastViewedAt ? new Date(linkedRuntime.lastViewedAt).getTime() : 0;
      const priority = getLinkedResourcePriority(status.progressPercent, status.downloaded, status.viewed);
      const meta =
        status.progressPercent > 0
          ? `${status.progressLabel} ${status.progressPercent}%${status.downloaded ? ' · 已下载' : ''}`
          : status.downloaded
            ? '已下载 · 可离线继续'
            : status.viewed
              ? '已查看 · 可返回图书馆继续'
              : '课程资料已接入图书馆';
      const ctaLabel =
        status.progressPercent > 0 && status.progressPercent < 100
          ? '继续资料'
          : status.progressPercent >= 100
            ? '再次查看'
            : status.downloaded
              ? '打开资料'
              : '查看资料';

      return {
        resourceId: resource.id,
        resourceTitle: resource.title,
        progressPercent: status.progressPercent,
        progressLabel: status.progressLabel,
        downloaded: status.downloaded,
        meta,
        ctaLabel,
        priority,
        lastViewedAt,
      };
    })
    .filter((item): item is CourseLinkedResourceAction & { priority: number; lastViewedAt: number } => Boolean(item))
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      if (right.progressPercent !== left.progressPercent) {
        return right.progressPercent - left.progressPercent;
      }

      return right.lastViewedAt - left.lastViewedAt;
    });

  const primary = candidates[0];
  if (!primary) {
    return null;
  }

  return {
    resourceId: primary.resourceId,
    resourceTitle: primary.resourceTitle,
    progressPercent: primary.progressPercent,
    progressLabel: primary.progressLabel,
    downloaded: primary.downloaded,
    meta: primary.meta,
    ctaLabel: primary.ctaLabel,
  };
}

export function getCourseRecentActivity(
  course: CourseItem,
  runtime: CourseRuntimeState,
  libraryRuntimeRecord: LibraryRuntimeRecord = {},
): CourseRecentActivity {
  const recentLessonLabel = resolveRecentLesson(course, runtime);
  const latestLinkedResourceActivity = getLatestLinkedResourceActivity(course, runtime, libraryRuntimeRecord);
  const courseActivityTime = runtime.lastStudiedAt ? new Date(runtime.lastStudiedAt).getTime() : 0;
  const resourceActivityTime = latestLinkedResourceActivity ? latestLinkedResourceActivity.sortValue : 0;

  if (latestLinkedResourceActivity && (!runtime.lastStudiedAt || resourceActivityTime >= courseActivityTime)) {
    const { resource, status, lastViewedAt } = latestLinkedResourceActivity;
    return {
      at: lastViewedAt,
      label: formatLastStudiedAt(lastViewedAt),
      source: 'resource',
      detail:
        status.progressPercent > 0
          ? `最近通过资料《${resource.title}》继续，当前${status.progressLabel} ${status.progressPercent}%`
          : `最近通过资料《${resource.title}》继续，已回到课程资料链路`,
      resourceId: resource.id,
      resourceTitle: resource.title,
    };
  }

  if (runtime.lastStudiedAt) {
    return {
      at: runtime.lastStudiedAt,
      label: formatLastStudiedAt(runtime.lastStudiedAt),
      source: 'course',
      detail: `最近停在 ${recentLessonLabel}，当前进度 ${calculateCourseProgress(course, runtime)}%`,
    };
  }

  return {
    at: null,
    label: '尚未学习',
    source: null,
    detail: `等待从《${course.title}》开始第一课或先查看关联资料。`,
  };
}

export function resolveRecentLesson(course: CourseItem, runtime: CourseRuntimeState): string {
  const currentLesson = course.syllabus.find((lesson) => lesson.id === runtime.currentLessonId);
  if (currentLesson) {
    return currentLesson.title;
  }

  const latestCompleted = [...course.syllabus]
    .reverse()
    .find((lesson) => runtime.completedLessonIds.includes(lesson.id));
  if (latestCompleted) {
    return latestCompleted.title;
  }

  return course.syllabus.find((lesson) => !runtime.completedLessonIds.includes(lesson.id))?.title ?? course.recentLesson;
}

export function formatLastStudiedAt(value: string | null): string {
  if (!value) {
    return '尚未学习';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function buildDisplayCourse(
  course: CourseItem,
  record: CourseRuntimeRecord,
  libraryRuntimeRecord: LibraryRuntimeRecord = {},
): DisplayCourse {
  const runtime = getCourseRuntime(course, record);
  const recentLessonLabel = resolveRecentLesson(course, runtime);
  const materialsOverview = getCourseMaterialsOverview(course, runtime, libraryRuntimeRecord);
  const primaryLinkedResource = getCoursePrimaryLinkedResource(course, runtime, libraryRuntimeRecord);
  const recentActivity = getCourseRecentActivity(course, runtime, libraryRuntimeRecord);
  return {
    ...course,
    runtime,
    progressValue: calculateCourseProgress(course, runtime),
    completedLessonsCount: getCompletedLessonsCount(runtime),
    viewedMaterialsCount: materialsOverview.viewedCount,
    linkedMaterialsCount: materialsOverview.linkedCount,
    inProgressMaterialsCount: materialsOverview.inProgressCount,
    downloadedMaterialsCount: materialsOverview.downloadedCount,
    primaryLinkedResource,
    lastActivityAt: recentActivity.at,
    lastActivitySource: recentActivity.source,
    lastActivityDetail: recentActivity.detail,
    ...(recentActivity.resourceId ? { lastActivityResourceId: recentActivity.resourceId } : {}),
    ...(recentActivity.resourceTitle ? { lastActivityResourceTitle: recentActivity.resourceTitle } : {}),
    recentLessonLabel,
    lastStudiedLabel: recentActivity.label,
  };
}

export function buildDisplayCourses(
  courses: CourseItem[],
  record: CourseRuntimeRecord,
  libraryRuntimeRecord: LibraryRuntimeRecord = {},
): DisplayCourse[] {
  return courses.map((course) => buildDisplayCourse(course, record, libraryRuntimeRecord));
}

export function getContinueLearningCourses(displayCourses: DisplayCourse[], limit = 2): DisplayCourse[] {
  return [...displayCourses]
    .filter((course) => course.lastActivityAt)
    .sort((left, right) => {
      const leftTime = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0;
      const rightTime = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);
}

export function getLearningOverview(displayCourses: DisplayCourse[]): LearningOverview {
  const continueLearningCourses = getContinueLearningCourses(displayCourses, 1);

  return {
    activeCourseCount: displayCourses.filter((course) => course.progressValue > 0 && course.progressValue < 100).length,
    completedLessonCount: displayCourses.reduce((sum, course) => sum + course.completedLessonsCount, 0),
    viewedMaterialCount: displayCourses.reduce((sum, course) => sum + course.viewedMaterialsCount, 0),
    linkedMaterialCount: displayCourses.reduce((sum, course) => sum + course.linkedMaterialsCount, 0),
    inProgressMaterialCount: displayCourses.reduce((sum, course) => sum + course.inProgressMaterialsCount, 0),
    downloadedMaterialCount: displayCourses.reduce((sum, course) => sum + course.downloadedMaterialsCount, 0),
    recentCourseId: continueLearningCourses[0]?.id ?? null,
    recentCourseTitle: continueLearningCourses[0]?.title ?? '尚无最近学习记录',
  };
}

export function markCurrentLesson(runtime: CourseRuntimeState, lessonId: string): CourseRuntimeState {
  return stampRuntime({
    ...runtime,
    currentLessonId: lessonId,
  });
}

export function toggleLessonCompleted(runtime: CourseRuntimeState, lessonId: string): CourseRuntimeState {
  const completedLessonIds = runtime.completedLessonIds.includes(lessonId)
    ? runtime.completedLessonIds.filter((id) => id !== lessonId)
    : [...runtime.completedLessonIds, lessonId];

  return stampRuntime({
    ...runtime,
    currentLessonId: lessonId,
    completedLessonIds,
  });
}

export function completeNextPendingLesson(course: CourseItem, runtime: CourseRuntimeState): CourseRuntimeState {
  const pendingLesson = course.syllabus.find((lesson) => !runtime.completedLessonIds.includes(lesson.id));
  if (!pendingLesson) {
    return runtime;
  }

  const completedLessonIds = runtime.completedLessonIds.includes(pendingLesson.id)
    ? runtime.completedLessonIds
    : [...runtime.completedLessonIds, pendingLesson.id];
  const nextPendingLesson = course.syllabus.find((lesson) => !completedLessonIds.includes(lesson.id)) ?? null;

  return stampRuntime({
    ...runtime,
    currentLessonId: nextPendingLesson?.id ?? pendingLesson.id,
    completedLessonIds,
  });
}

export function toggleMaterialViewed(runtime: CourseRuntimeState, materialId: string): CourseRuntimeState {
  const viewedMaterialIds = runtime.viewedMaterialIds.includes(materialId)
    ? runtime.viewedMaterialIds.filter((id) => id !== materialId)
    : [...runtime.viewedMaterialIds, materialId];

  return stampRuntime({
    ...runtime,
    viewedMaterialIds,
  });
}

export function setDetailTab(runtime: CourseRuntimeState, tab: CourseDetailTab): CourseRuntimeState {
  return {
    ...runtime,
    lastOpenedTab: tab,
  };
}
