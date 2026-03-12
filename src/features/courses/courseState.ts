import { CourseDetailTab, CourseItem, CourseRuntimeRecord, CourseRuntimeState } from '../../types/app';

export type DisplayCourse = CourseItem & {
  runtime: CourseRuntimeState;
  progressValue: number;
  completedLessonsCount: number;
  viewedMaterialsCount: number;
  recentLessonLabel: string;
  lastStudiedLabel: string;
};

export type LearningOverview = {
  activeCourseCount: number;
  completedLessonCount: number;
  viewedMaterialCount: number;
  recentCourseId: string | null;
  recentCourseTitle: string;
};

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

export function getViewedMaterialsCount(runtime: CourseRuntimeState): number {
  return runtime.viewedMaterialIds.length;
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

export function buildDisplayCourse(course: CourseItem, record: CourseRuntimeRecord): DisplayCourse {
  const runtime = getCourseRuntime(course, record);
  return {
    ...course,
    runtime,
    progressValue: calculateCourseProgress(course, runtime),
    completedLessonsCount: getCompletedLessonsCount(runtime),
    viewedMaterialsCount: getViewedMaterialsCount(runtime),
    recentLessonLabel: resolveRecentLesson(course, runtime),
    lastStudiedLabel: formatLastStudiedAt(runtime.lastStudiedAt),
  };
}

export function buildDisplayCourses(courses: CourseItem[], record: CourseRuntimeRecord): DisplayCourse[] {
  return courses.map((course) => buildDisplayCourse(course, record));
}

export function getContinueLearningCourses(displayCourses: DisplayCourse[], limit = 2): DisplayCourse[] {
  return [...displayCourses]
    .filter((course) => course.runtime.lastStudiedAt)
    .sort((left, right) => {
      const leftTime = left.runtime.lastStudiedAt ? new Date(left.runtime.lastStudiedAt).getTime() : 0;
      const rightTime = right.runtime.lastStudiedAt ? new Date(right.runtime.lastStudiedAt).getTime() : 0;
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
