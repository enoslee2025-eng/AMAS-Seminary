import { libraryResources, courses } from '../../data/mockData';
import { CommunityNotification, CommunityPostPreview, ConversationPreview, LibraryRuntimeRecord } from '../../types/app';
import { DisplayCourse } from '../courses/courseState';
import { getDisplayTimeSortValue } from '../community/communityState';
import { getLibraryProgressLabel } from '../library/libraryState';

export type LearningActivityItem = {
  id: string;
  kind: 'course' | 'resource' | 'community';
  title: string;
  detail: string;
  timeLabel: string;
  sortValue: number;
  courseId?: string;
  resourceId?: string;
};

export type LearningActivityFilter = LearningActivityItem['kind'] | 'all';

export type ProfileResourceFocusItem = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  resourceId: string;
  sortValue: number;
};

export type ProfileDiscussionTaskItem = {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  sortValue: number;
  courseId: string;
};

export type ProfileTodayTaskItem = {
  id: string;
  kind: 'course' | 'resource' | 'conversation' | 'notification';
  title: string;
  detail: string;
  meta: string;
  sortValue: number;
  entryTarget?: 'course' | 'resource';
  courseId?: string;
  resourceId?: string;
  conversationId?: string;
  notificationId?: string;
};

export type ProfileTodayTaskOverview = {
  total: number;
  pendingLessons: number;
  pendingResources: number;
  unreadMessages: number;
  unreadNotifications: number;
};

export type ProcessedQueueLogItem = {
  id: string;
  category: 'learning' | 'reminder' | 'course';
  title: string;
  detail: string;
  actionLabel: string;
  impactCount: number;
  dateKey: string;
  processedAt: string;
  processedLabel: string;
};

export type ProcessedQueueSummary = {
  totalActions: number;
  totalImpact: number;
  learningActions: number;
  reminderActions: number;
  lastProcessedLabel: string;
};

export type ProcessedQueueRhythmPoint = {
  dateKey: string;
  label: string;
  totalActions: number;
  learningActions: number;
  reminderImpact: number;
  isToday: boolean;
};

export type ProcessedQueueRhythmSummary = {
  streakDays: number;
  weeklyTotalActions: number;
  weeklyLearningActions: number;
  weeklyReminderImpact: number;
  activeDays: number;
  peakLabel: string;
};

export type WeeklyGoalSummary = {
  weeklyTargetActions: number;
  weeklyCompletedActions: number;
  weeklyCompletionRate: number;
  remainingWeeklyActions: number;
  remainingTodayTasks: number;
  dominantCategoryLabel: string;
  dominantCategoryDetail: string;
  nextStepLabel: string;
  nextStepDetail: string;
};

export type RecommendedStudyAction = {
  kind: 'course' | 'resource';
  entryTarget: 'course' | 'resource';
  title: string;
  detail: string;
  ctaLabel: string;
  courseId?: string;
  resourceId?: string;
  resourceTitle?: string;
};

export type RecommendedReminderAction = {
  section: 'conversations' | 'notifications';
  title: string;
  detail: string;
  ctaLabel: string;
  conversationId?: string;
  notificationId?: string;
};

export type ProfileActionCoachSummary = {
  recommendedStudy: RecommendedStudyAction | null;
  recommendedReminder: RecommendedReminderAction | null;
  dailySummary: string;
};

export type DailyWrapUpReport = {
  headline: string;
  body: string;
  text: string;
};

export type ProfileSprintStep = {
  id: string;
  title: string;
  detail: string;
  ctaLabel: string;
  entryTarget?: 'course' | 'resource';
  courseId?: string;
  resourceId?: string;
  conversationId?: string;
  notificationId?: string;
};

export type ProfileSprintSummary = {
  totalSteps: number;
  completedSteps: number;
  remainingSteps: number;
  nextStepTitle: string;
  nextStepDetail: string;
};

function formatAbsoluteTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatTimeOnly(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalDateKey(now = new Date()) {
  return getDateKey(now);
}

function shiftDate(date: Date, offsetDays: number) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + offsetDays);
  return next;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function truncateText(value: string, maxLength = 42) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function getRemainingLessons(course: DisplayCourse) {
  return Math.max(course.syllabus.length - course.completedLessonsCount, 0);
}

function getSortTime(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0;
}

function buildTodayOverviewBreakdown(todayOverview: ProfileTodayTaskOverview) {
  return `其中包含 ${todayOverview.pendingLessons} 个课时、${todayOverview.pendingResources} 份资料进度和 ${
    todayOverview.unreadMessages + todayOverview.unreadNotifications
  } 条提醒。`;
}

function isLearningActionCategory(category: ProcessedQueueLogItem['category']) {
  return category === 'learning' || category === 'course';
}

export function buildLearningActivities({
  displayCourses,
  libraryRuntimeRecord,
  communityPosts,
  profileName,
}: {
  displayCourses: DisplayCourse[];
  libraryRuntimeRecord: LibraryRuntimeRecord;
  communityPosts: CommunityPostPreview[];
  profileName: string;
}): LearningActivityItem[] {
  const courseActivities = displayCourses
    .filter((course) => course.lastActivityAt)
    .map((course) => ({
      id: `course-${course.id}`,
      kind: 'course' as const,
      title: `学习课程《${course.title}》`,
      detail: course.lastActivityDetail,
      timeLabel: course.lastStudiedLabel,
      sortValue: new Date(course.lastActivityAt as string).getTime(),
      courseId: course.id,
      ...(course.lastActivityResourceId ? { resourceId: course.lastActivityResourceId } : {}),
    }));

  const resourceActivities = libraryResources
    .filter((resource) => libraryRuntimeRecord[resource.id]?.lastViewedAt)
    .map((resource) => {
      const runtime = libraryRuntimeRecord[resource.id];
      const viewedAt = runtime?.lastViewedAt as string;
      const progressPercent = runtime?.progressPercent ?? 0;
      const relatedCourse = resource.relatedCourseId ? courses.find((course) => course.id === resource.relatedCourseId) ?? null : null;
      const baseDetail = relatedCourse ? `关联课程《${relatedCourse.title}》 · ${resource.format}` : `${resource.author} · ${resource.format}`;

      return {
        id: `resource-${resource.id}`,
        kind: 'resource' as const,
        title: `查看资料《${resource.title}》`,
        detail: progressPercent > 0 ? `${getLibraryProgressLabel(progressPercent)} ${progressPercent}% · ${baseDetail}` : baseDetail,
        timeLabel: formatAbsoluteTime(viewedAt),
        sortValue: new Date(viewedAt).getTime(),
        courseId: resource.relatedCourseId,
        resourceId: resource.id,
      };
    });

  const authoredPostActivities = communityPosts
    .filter((post) => post.courseId && normalizeName(post.author) === normalizeName(profileName))
    .map((post) => {
      const relatedCourse = courses.find((course) => course.id === post.courseId) ?? null;

      return {
        id: `post-${post.id}`,
        kind: 'community' as const,
        title: '发布课程感悟',
        detail: relatedCourse ? `在《${relatedCourse.title}》中写下：${truncateText(post.content)}` : truncateText(post.content),
        timeLabel: post.time,
        sortValue: getDisplayTimeSortValue(post.time),
        courseId: post.courseId,
      };
    });

  const authoredCommentActivities = communityPosts.flatMap((post) => {
    const relatedCourse = post.courseId ? courses.find((course) => course.id === post.courseId) ?? null : null;

    return post.comments
      .filter((comment) => post.courseId && normalizeName(comment.author) === normalizeName(profileName))
      .map((comment) => ({
        id: `comment-${comment.id}`,
        kind: 'community' as const,
        title: '参与课程讨论',
        detail: relatedCourse ? `在《${relatedCourse.title}》的讨论中回复：${truncateText(comment.content)}` : truncateText(comment.content),
        timeLabel: comment.time,
        sortValue: getDisplayTimeSortValue(comment.time),
        courseId: post.courseId,
      }));
  });

  return [...courseActivities, ...resourceActivities, ...authoredPostActivities, ...authoredCommentActivities].sort(
    (left, right) => right.sortValue - left.sortValue,
  );
}

export function buildProfileResourceFocus(runtimeRecord: LibraryRuntimeRecord, limit = 3): ProfileResourceFocusItem[] {
  return libraryResources
    .filter((resource) => runtimeRecord[resource.id]?.favorite || runtimeRecord[resource.id]?.lastViewedAt)
    .map((resource) => {
      const runtime = runtimeRecord[resource.id];
      const viewedAt = runtime?.lastViewedAt ? new Date(runtime.lastViewedAt).getTime() : 0;
      const progressPercent = runtime?.progressPercent ?? 0;
      const relatedCourse = resource.relatedCourseId ? courses.find((course) => course.id === resource.relatedCourseId) ?? null : null;
      const detail = relatedCourse ? `关联课程《${relatedCourse.title}》 · ${resource.format}` : `${resource.author} · ${resource.format}`;
      const progressLabel = progressPercent > 0 ? `${getLibraryProgressLabel(progressPercent)} ${progressPercent}%` : null;
      const meta = runtime?.favorite
        ? viewedAt
          ? `${progressLabel ? `${progressLabel} · ` : ''}已收藏 · 最近查看 ${formatAbsoluteTime(runtime.lastViewedAt as string)}`
          : progressLabel
            ? `${progressLabel} · 已收藏到个人资料夹`
            : '已收藏到个人资料夹'
        : progressLabel
          ? `${progressLabel} · 最近查看 ${formatAbsoluteTime(runtime?.lastViewedAt as string)}`
          : `最近查看 ${formatAbsoluteTime(runtime?.lastViewedAt as string)}`;

      return {
        id: resource.id,
        title: resource.title,
        detail,
        meta,
        resourceId: resource.id,
        sortValue: (runtime?.favorite ? 10 ** 15 : 0) + viewedAt,
      };
    })
    .sort((left, right) => right.sortValue - left.sortValue)
    .slice(0, limit);
}

export function buildPendingDiscussionTasks({
  notifications,
  communityPosts,
  profileName,
  limit = 3,
}: {
  notifications: CommunityNotification[];
  communityPosts: CommunityPostPreview[];
  profileName: string;
  limit?: number;
}): ProfileDiscussionTaskItem[] {
  const notificationTasks = notifications
    .filter((item) => item.type === 'interaction' && !item.read)
    .map((item) => {
      const relatedPost = item.postId ? communityPosts.find((post) => post.id === item.postId) ?? null : null;
      const courseId = item.courseId ?? relatedPost?.courseId;
      if (!courseId) {
        return null;
      }

      const relatedCourse = courses.find((course) => course.id === courseId) ?? null;
      return {
        id: item.id,
        title: item.title,
        detail: relatedCourse ? `课程《${relatedCourse.title}》 · ${item.detail}` : item.detail,
        timeLabel: item.time,
        sortValue: getDisplayTimeSortValue(item.time),
        courseId,
      };
    })
    .filter((item): item is ProfileDiscussionTaskItem => Boolean(item))
    .sort((left, right) => right.sortValue - left.sortValue);

  if (notificationTasks.length > 0) {
    return notificationTasks.slice(0, limit);
  }

  return communityPosts
    .filter((post) => post.courseId && normalizeName(post.author) === normalizeName(profileName))
    .map((post) => {
      const latestExternalComment = [...post.comments]
        .filter((comment) => normalizeName(comment.author) !== normalizeName(profileName))
        .sort((left, right) => getDisplayTimeSortValue(right.time) - getDisplayTimeSortValue(left.time))[0];

      if (!latestExternalComment) {
        return null;
      }

      const relatedCourse = courses.find((course) => course.id === post.courseId) ?? null;

      return {
        id: `follow-up-${post.id}-${latestExternalComment.id}`,
        title: '有人回复了你的课程感悟',
        detail: relatedCourse
          ? `${latestExternalComment.author} 在《${relatedCourse.title}》中回复：${truncateText(latestExternalComment.content)}`
          : `${latestExternalComment.author} 回复：${truncateText(latestExternalComment.content)}`,
        timeLabel: latestExternalComment.time,
        sortValue: getDisplayTimeSortValue(latestExternalComment.time),
        courseId: post.courseId as string,
      };
    })
    .filter((item): item is ProfileDiscussionTaskItem => Boolean(item))
    .sort((left, right) => right.sortValue - left.sortValue)
    .slice(0, limit);
}

function getPendingCourseTasks(displayCourses: DisplayCourse[]) {
  const courseTasks = displayCourses
    .filter((course) => course.progressValue > 0 && course.progressValue < 100)
    .map((course) => {
      const remainingLessons = Math.max(course.syllabus.length - course.completedLessonsCount, 0);
      if (remainingLessons === 0) {
        return null;
      }

      const sortValue = course.lastActivityAt ? new Date(course.lastActivityAt).getTime() : 0;
      const shouldOpenPrimaryResource = Boolean(
        course.primaryLinkedResource &&
          (
            course.lastActivitySource === 'resource' ||
            course.primaryLinkedResource.progressPercent > 0 ||
            course.primaryLinkedResource.downloaded
          ),
      );
      return {
        id: `today-course-${course.id}`,
        kind: 'course' as const,
        title: `继续《${course.title}》`,
        detail:
          shouldOpenPrimaryResource && course.primaryLinkedResource
            ? `还有 ${remainingLessons} 个课时待完成，建议先通过资料《${course.primaryLinkedResource.resourceTitle}》继续。`
            : `还有 ${remainingLessons} 个课时待完成，当前停在 ${course.recentLessonLabel}`,
        meta:
          course.lastActivitySource === 'resource' && course.lastActivityResourceTitle
            ? `课程资料待办 · 最近通过《${course.lastActivityResourceTitle}》继续 ${course.lastStudiedLabel}`
            : course.lastActivityAt
              ? `课程待办 · 最近学习 ${course.lastStudiedLabel}`
              : '课程待办 · 等待继续推进',
        sortValue: 10 ** 14 + sortValue,
        entryTarget: shouldOpenPrimaryResource ? ('resource' as const) : ('course' as const),
        courseId: course.id,
        ...(shouldOpenPrimaryResource && course.primaryLinkedResource ? { resourceId: course.primaryLinkedResource.resourceId } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    courseTasks,
    surfacedResourceIds: new Set(
      courseTasks
        .filter((task) => task.entryTarget === 'resource' && task.resourceId)
        .map((task) => task.resourceId as string),
    ),
  };
}

export function buildProfileTodayTasks({
  displayCourses,
  libraryRuntimeRecord,
  conversations,
  notifications,
  limit = 6,
}: {
  displayCourses: DisplayCourse[];
  libraryRuntimeRecord: LibraryRuntimeRecord;
  conversations: ConversationPreview[];
  notifications: CommunityNotification[];
  limit?: number;
}): ProfileTodayTaskItem[] {
  const { courseTasks, surfacedResourceIds } = getPendingCourseTasks(displayCourses);

  const resourceTasks = libraryResources
    .filter((resource) => {
      if (surfacedResourceIds.has(resource.id)) {
        return false;
      }

      const progressPercent = libraryRuntimeRecord[resource.id]?.progressPercent ?? 0;
      return progressPercent > 0 && progressPercent < 100;
    })
    .map((resource) => {
      const runtime = libraryRuntimeRecord[resource.id];
      const progressPercent = runtime?.progressPercent ?? 0;
      const relatedCourse = resource.relatedCourseId ? courses.find((course) => course.id === resource.relatedCourseId) ?? null : null;
      const lastViewedLabel = runtime?.lastViewedAt ? formatAbsoluteTime(runtime.lastViewedAt) : '等待继续阅读';

      return {
        id: `today-resource-${resource.id}`,
        kind: 'resource' as const,
        title: `继续《${resource.title}》`,
        detail: relatedCourse
          ? `${getLibraryProgressLabel(progressPercent)} ${progressPercent}% · 已关联《${relatedCourse.title}》`
          : `${getLibraryProgressLabel(progressPercent)} ${progressPercent}% · ${resource.author}`,
        meta: `资料待办 · 最近阅读 ${lastViewedLabel}${runtime?.downloaded ? ' · 已离线' : ''}`,
        sortValue: 15 * 10 ** 13 + getSortTime(runtime?.lastViewedAt) + progressPercent,
        resourceId: resource.id,
      };
    });

  const conversationTasks = [...conversations]
    .filter((conversation) => conversation.unread > 0)
    .sort((left, right) => {
      if (right.unread !== left.unread) {
        return right.unread - left.unread;
      }

      return getDisplayTimeSortValue(right.time) - getDisplayTimeSortValue(left.time);
    })
    .map((conversation) => ({
      id: `today-conversation-${conversation.id}`,
      kind: 'conversation' as const,
      title: `${conversation.name} 有 ${conversation.unread} 条未读消息`,
      detail: conversation.subtitle,
      meta: `最近消息 · ${conversation.time}`,
      sortValue: 3 * 10 ** 14 + getDisplayTimeSortValue(conversation.time) + conversation.unread,
      conversationId: conversation.id,
    }));

  const notificationTasks = notifications
    .filter((notification) => !notification.read)
    .sort((left, right) => getDisplayTimeSortValue(right.time) - getDisplayTimeSortValue(left.time))
    .map((notification) => ({
      id: `today-notification-${notification.id}`,
      kind: 'notification' as const,
      title: notification.title,
      detail: notification.detail,
      meta: `通知中心 · ${notification.time}`,
      sortValue: 2 * 10 ** 14 + getDisplayTimeSortValue(notification.time),
      notificationId: notification.id,
    }));

  return [...conversationTasks, ...notificationTasks, ...resourceTasks, ...courseTasks]
    .sort((left, right) => right.sortValue - left.sortValue)
    .slice(0, limit);
}

export function getProfileTodayTaskOverview(
  displayCourses: DisplayCourse[],
  libraryRuntimeRecord: LibraryRuntimeRecord,
  conversations: ConversationPreview[],
  notifications: CommunityNotification[],
): ProfileTodayTaskOverview {
  const { courseTasks, surfacedResourceIds } = getPendingCourseTasks(displayCourses);
  const pendingStandaloneResources = libraryResources.reduce((sum, resource) => {
    if (surfacedResourceIds.has(resource.id)) {
      return sum;
    }

    const progressPercent = libraryRuntimeRecord[resource.id]?.progressPercent ?? 0;
    return progressPercent > 0 && progressPercent < 100 ? sum + 1 : sum;
  }, 0);

  return {
    total: courseTasks.length + pendingStandaloneResources + conversations.filter((conversation) => conversation.unread > 0).length + notifications.filter((notification) => !notification.read).length,
    pendingLessons: displayCourses.reduce((sum, course) => {
      if (course.progressValue <= 0 || course.progressValue >= 100) {
        return sum;
      }

      return sum + Math.max(course.syllabus.length - course.completedLessonsCount, 0);
    }, 0),
    pendingResources: pendingStandaloneResources,
    unreadMessages: conversations.reduce((sum, conversation) => sum + conversation.unread, 0),
    unreadNotifications: notifications.filter((notification) => !notification.read).length,
  };
}

export function createProcessedQueueLogItem({
  category,
  title,
  detail,
  actionLabel,
  impactCount = 1,
  now = new Date(),
}: {
  category: ProcessedQueueLogItem['category'];
  title: string;
  detail: string;
  actionLabel: string;
  impactCount?: number;
  now?: Date;
}): ProcessedQueueLogItem {
  return {
    id: `handled-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    title,
    detail,
    actionLabel,
    impactCount,
    dateKey: getDateKey(now),
    processedAt: now.toISOString(),
    processedLabel: formatTimeOnly(now.toISOString()),
  };
}

export function getTodayProcessedQueueLog(items: ProcessedQueueLogItem[], now = new Date()) {
  const todayKey = getDateKey(now);
  return items
    .filter((item) => item.dateKey === todayKey)
    .sort((left, right) => new Date(right.processedAt).getTime() - new Date(left.processedAt).getTime());
}

export function getProcessedQueueSummary(items: ProcessedQueueLogItem[], now = new Date()): ProcessedQueueSummary {
  const todayItems = getTodayProcessedQueueLog(items, now);
  return {
    totalActions: todayItems.length,
    totalImpact: todayItems.reduce((sum, item) => sum + item.impactCount, 0),
    learningActions: todayItems.filter((item) => isLearningActionCategory(item.category)).length,
    reminderActions: todayItems.filter((item) => item.category === 'reminder').reduce((sum, item) => sum + item.impactCount, 0),
    lastProcessedLabel: todayItems[0]?.processedLabel ?? '还没有处理记录',
  };
}

export function buildProcessedQueueRhythm(items: ProcessedQueueLogItem[], now = new Date(), days = 7): ProcessedQueueRhythmPoint[] {
  const startDate = shiftDate(now, -(days - 1));

  return Array.from({ length: days }, (_, index) => {
    const currentDate = shiftDate(startDate, index);
    const dateKey = getDateKey(currentDate);
    const dayItems = items.filter((item) => item.dateKey === dateKey);
    const totalActions = dayItems.length;
    const learningActions = dayItems.filter((item) => isLearningActionCategory(item.category)).length;
    const reminderImpact = dayItems
      .filter((item) => item.category === 'reminder')
      .reduce((sum, item) => sum + item.impactCount, 0);
    const dayOffset = shiftDate(currentDate, 0).getDay();
    const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];

    return {
      dateKey,
      label: dateKey === getDateKey(now) ? '今天' : `周${weekdayLabels[dayOffset]}`,
      totalActions,
      learningActions,
      reminderImpact,
      isToday: dateKey === getDateKey(now),
    };
  });
}

export function getProcessedQueueRhythmSummary(items: ProcessedQueueLogItem[], now = new Date()): ProcessedQueueRhythmSummary {
  const points = buildProcessedQueueRhythm(items, now, 7);

  let streakDays = 0;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].totalActions === 0) {
      break;
    }
    streakDays += 1;
  }

  const peakPoint = [...points].sort((left, right) => right.totalActions - left.totalActions)[0];

  return {
    streakDays,
    weeklyTotalActions: points.reduce((sum, item) => sum + item.totalActions, 0),
    weeklyLearningActions: points.reduce((sum, item) => sum + item.learningActions, 0),
    weeklyReminderImpact: points.reduce((sum, item) => sum + item.reminderImpact, 0),
    activeDays: points.filter((item) => item.totalActions > 0).length,
    peakLabel: peakPoint && peakPoint.totalActions > 0 ? `${peakPoint.label} ${peakPoint.totalActions} 项` : '本周还没有处理峰值',
  };
}

export function getWeeklyGoalSummary({
  items,
  todayOverview,
  now = new Date(),
  weeklyTargetActions = 10,
}: {
  items: ProcessedQueueLogItem[];
  todayOverview: ProfileTodayTaskOverview;
  now?: Date;
  weeklyTargetActions?: number;
}): WeeklyGoalSummary {
  const rhythmSummary = getProcessedQueueRhythmSummary(items, now);
  const weeklyCompletedActions = rhythmSummary.weeklyTotalActions;
  const remainingWeeklyActions = Math.max(weeklyTargetActions - weeklyCompletedActions, 0);
  const weeklyCompletionRate = Math.min(100, Math.round((weeklyCompletedActions / weeklyTargetActions) * 100));
  const reminderLoad = rhythmSummary.weeklyReminderImpact;
  const learningLoad = rhythmSummary.weeklyLearningActions;
  const unreadLoad = todayOverview.unreadMessages + todayOverview.unreadNotifications;

  let dominantCategoryLabel = '尚未形成处理重心';
  let dominantCategoryDetail = '开始处理今日待办后，这里会自动判断你本周更常推进哪类任务。';

  if (learningLoad === reminderLoad && learningLoad > 0) {
    dominantCategoryLabel = '学习与提醒均衡';
    dominantCategoryDetail = `近 7 天学习推进 ${learningLoad} 次，提醒清理 ${reminderLoad} 项，整体节奏比较平衡。`;
  } else if (learningLoad > reminderLoad) {
    dominantCategoryLabel = '学习推进为主';
    dominantCategoryDetail = `近 7 天主要在推进课程、资料或社区互动，共完成 ${learningLoad} 次学习动作。`;
  } else if (reminderLoad > learningLoad) {
    dominantCategoryLabel = '提醒收尾为主';
    dominantCategoryDetail = `近 7 天主要在清理消息和通知，共处理 ${reminderLoad} 项提醒。`;
  }

  let nextStepLabel = '继续保持本周节奏';
  let nextStepDetail = remainingWeeklyActions > 0 ? `本周目标还差 ${remainingWeeklyActions} 项，继续处理下一条待办就会向前推进。` : '本周目标已经达成，可以继续巩固课程或补更多互动跟进。';

  if (todayOverview.total === 0) {
    nextStepLabel = remainingWeeklyActions > 0 ? '今日队列已清空' : '本周目标已完成';
    nextStepDetail =
      remainingWeeklyActions > 0
        ? `今天的待办已经清空，本周目标还差 ${remainingWeeklyActions} 项。`
        : '今天和本周的核心目标都已完成，可以进入资料阅读或课程讨论复盘。';
  } else if (todayOverview.pendingLessons > 0) {
    nextStepLabel = '优先完成学习进度';
    nextStepDetail = `离清空今日待办还差 ${todayOverview.total} 项，当前最明显的是 ${todayOverview.pendingLessons} 个课时和 ${todayOverview.pendingResources} 份资料进度待推进。`;
  } else if (todayOverview.pendingResources > 0) {
    nextStepLabel = '优先继续资料阅读';
    nextStepDetail = `离清空今日待办还差 ${todayOverview.total} 项，当前有 ${todayOverview.pendingResources} 份资料阅读进度待继续。`;
  } else if (unreadLoad > 0) {
    nextStepLabel = '优先清理提醒';
    nextStepDetail = `离清空今日待办还差 ${todayOverview.total} 项，当前主要是 ${unreadLoad} 条消息和通知提醒。`;
  }

  return {
    weeklyTargetActions,
    weeklyCompletedActions,
    weeklyCompletionRate,
    remainingWeeklyActions,
    remainingTodayTasks: todayOverview.total,
    dominantCategoryLabel,
    dominantCategoryDetail,
    nextStepLabel,
    nextStepDetail,
  };
}

export function getProfileActionCoachSummary({
  displayCourses,
  libraryRuntimeRecord,
  conversations,
  notifications,
  todayOverview,
  processedSummary,
}: {
  displayCourses: DisplayCourse[];
  libraryRuntimeRecord: LibraryRuntimeRecord;
  conversations: ConversationPreview[];
  notifications: CommunityNotification[];
  todayOverview: ProfileTodayTaskOverview;
  processedSummary: ProcessedQueueSummary;
}): ProfileActionCoachSummary {
  const recommendedCourseSource =
    [...displayCourses]
      .filter((course) => course.progressValue > 0 && course.progressValue < 100)
      .sort((left, right) => {
        if (right.progressValue !== left.progressValue) {
          return right.progressValue - left.progressValue;
        }

        const remainingDiff = getRemainingLessons(left) - getRemainingLessons(right);
        if (remainingDiff !== 0) {
          return remainingDiff;
        }

        return getSortTime(right.lastActivityAt) - getSortTime(left.lastActivityAt);
      })[0] ?? null;

  const recommendedResourceSource =
    [...libraryResources]
      .filter((resource) => {
        const progressPercent = libraryRuntimeRecord[resource.id]?.progressPercent ?? 0;
        return progressPercent > 0 && progressPercent < 100;
      })
      .sort((left, right) => {
        const leftRuntime = libraryRuntimeRecord[left.id];
        const rightRuntime = libraryRuntimeRecord[right.id];
        const leftProgress = leftRuntime?.progressPercent ?? 0;
        const rightProgress = rightRuntime?.progressPercent ?? 0;

        if (rightProgress !== leftProgress) {
          return rightProgress - leftProgress;
        }

        if (Number(Boolean(rightRuntime?.downloaded)) !== Number(Boolean(leftRuntime?.downloaded))) {
          return Number(Boolean(rightRuntime?.downloaded)) - Number(Boolean(leftRuntime?.downloaded));
        }

        return getSortTime(rightRuntime?.lastViewedAt) - getSortTime(leftRuntime?.lastViewedAt);
      })[0] ?? null;

  const recommendedStudy = recommendedCourseSource
    ? (() => {
        const shouldOpenPrimaryResource = Boolean(
          recommendedCourseSource.primaryLinkedResource &&
            (
              recommendedCourseSource.lastActivitySource === 'resource' ||
              recommendedCourseSource.primaryLinkedResource.progressPercent > 0 ||
              recommendedCourseSource.primaryLinkedResource.downloaded
            ),
        );

        return {
          kind: 'course' as const,
          entryTarget: shouldOpenPrimaryResource ? ('resource' as const) : ('course' as const),
          courseId: recommendedCourseSource.id,
          title: recommendedCourseSource.title,
          detail: shouldOpenPrimaryResource && recommendedCourseSource.primaryLinkedResource
            ? `已完成 ${recommendedCourseSource.completedLessonsCount}/${recommendedCourseSource.syllabus.length} 课时，还差 ${getRemainingLessons(recommendedCourseSource)} 课时，建议先通过资料《${recommendedCourseSource.primaryLinkedResource.resourceTitle}》继续。`
            : `已完成 ${recommendedCourseSource.completedLessonsCount}/${recommendedCourseSource.syllabus.length} 课时，还差 ${getRemainingLessons(recommendedCourseSource)} 课时，最近停在 ${recommendedCourseSource.recentLessonLabel}。`,
          ctaLabel: shouldOpenPrimaryResource ? '继续课程资料' : '打开推荐课程',
          ...(recommendedCourseSource.primaryLinkedResource
            ? {
                resourceId: recommendedCourseSource.primaryLinkedResource.resourceId,
                resourceTitle: recommendedCourseSource.primaryLinkedResource.resourceTitle,
              }
            : {}),
        };
      })()
    : recommendedResourceSource
      ? (() => {
          const runtime = libraryRuntimeRecord[recommendedResourceSource.id];
          const progressPercent = runtime?.progressPercent ?? 0;
          const relatedCourse = recommendedResourceSource.relatedCourseId
            ? courses.find((course) => course.id === recommendedResourceSource.relatedCourseId) ?? null
            : null;

          return {
            kind: 'resource' as const,
            entryTarget: 'resource' as const,
            resourceId: recommendedResourceSource.id,
            resourceTitle: recommendedResourceSource.title,
            title: recommendedResourceSource.title,
            detail: `${
              runtime?.downloaded ? '已加入离线资料夹 · ' : ''
            }${getLibraryProgressLabel(progressPercent)} ${progressPercent}% · ${
              relatedCourse ? `关联《${relatedCourse.title}》` : `${recommendedResourceSource.author} · ${recommendedResourceSource.format}`
            }`,
            ctaLabel: '打开推荐资料',
          };
        })()
      : null;

  const topConversation =
    [...conversations]
      .filter((conversation) => conversation.unread > 0)
      .sort((left, right) => {
        if (right.unread !== left.unread) {
          return right.unread - left.unread;
        }

        return getDisplayTimeSortValue(right.time) - getDisplayTimeSortValue(left.time);
      })[0] ?? null;
  const topNotification =
    [...notifications]
      .filter((notification) => !notification.read)
      .sort((left, right) => getDisplayTimeSortValue(right.time) - getDisplayTimeSortValue(left.time))[0] ?? null;

  let recommendedReminder: RecommendedReminderAction | null = null;

  if (topConversation && (!topNotification || topConversation.unread > 1)) {
    recommendedReminder = {
      section: 'conversations',
      title: topConversation.name,
      detail: `这里还有 ${topConversation.unread} 条未读消息，最近一条是“${truncateText(topConversation.subtitle, 34)}”。`,
      ctaLabel: '打开会话',
      conversationId: topConversation.id,
    };
  } else if (topNotification) {
    recommendedReminder = {
      section: 'notifications',
      title: topNotification.title,
      detail: `${topNotification.time} · ${truncateText(topNotification.detail, 38)}`,
      ctaLabel: '查看通知',
      notificationId: topNotification.id,
    };
  } else if (topConversation) {
    recommendedReminder = {
      section: 'conversations',
      title: topConversation.name,
      detail: `这里还有 ${topConversation.unread} 条未读消息，建议先处理最近消息。`,
      ctaLabel: '打开会话',
      conversationId: topConversation.id,
    };
  }

  let dailySummary = '今天还没有开始处理待办，建议先从当前最重要的一项开始。';

  if (processedSummary.totalActions > 0) {
    dailySummary = `今天已经处理 ${processedSummary.totalActions} 次动作，完成了 ${processedSummary.learningActions} 个学习动作，并清理了 ${processedSummary.reminderActions} 项提醒；当前还剩 ${todayOverview.total} 项待办。`;
  } else if (todayOverview.total > 0) {
    dailySummary = `今天还有 ${todayOverview.total} 项待办，${buildTodayOverviewBreakdown(todayOverview)}`;
  } else if (recommendedStudy) {
    dailySummary = `今天的待办已经清空，可以继续推进《${recommendedStudy.title}》，把这周的学习节奏保持住。`;
  }

  return {
    recommendedStudy,
    recommendedReminder,
    dailySummary,
  };
}

export function buildDailyWrapUpReport({
  profileName,
  todayOverview,
  processedSummary,
  weeklyGoalSummary,
  actionCoach,
}: {
  profileName: string;
  todayOverview: ProfileTodayTaskOverview;
  processedSummary: ProcessedQueueSummary;
  weeklyGoalSummary: WeeklyGoalSummary;
  actionCoach: ProfileActionCoachSummary;
}): DailyWrapUpReport {
  const headline =
    processedSummary.totalActions > 0
      ? `${profileName} 今日已处理 ${processedSummary.totalActions} 次学习动作`
      : `${profileName} 今日学习尚未开始`;

  const bodyLines = [
    processedSummary.totalActions > 0
      ? `今天完成了 ${processedSummary.learningActions} 个学习动作，并清理了 ${processedSummary.reminderActions} 项提醒。`
      : `今天还没有处理记录，当前待办里还有 ${todayOverview.total} 项。`,
    todayOverview.total > 0
      ? `当前还剩 ${todayOverview.total} 项待办，${buildTodayOverviewBreakdown(todayOverview)}`
      : '今日待办已经清空，可以把注意力转到复盘或下一步计划。',
    `本周目标已完成 ${weeklyGoalSummary.weeklyCompletedActions}/${weeklyGoalSummary.weeklyTargetActions}，完成率 ${weeklyGoalSummary.weeklyCompletionRate}%。`,
    `下一步建议：${weeklyGoalSummary.nextStepDetail}`,
    `今日总结：${actionCoach.dailySummary}`,
  ];

  return {
    headline,
    body: bodyLines.join('\n'),
    text: `${headline}\n${bodyLines.map((line) => `- ${line}`).join('\n')}`,
  };
}

export function buildProfileSprintPlan({
  recommendedStudy,
  recommendedReminder,
  nextTodayTask,
}: {
  recommendedStudy: RecommendedStudyAction | null;
  recommendedReminder: RecommendedReminderAction | null;
  nextTodayTask: ProfileTodayTaskItem | null;
}): ProfileSprintStep[] {
  const steps: ProfileSprintStep[] = [];
  const seenTargets = new Set<string>();

  if (recommendedStudy) {
    const targetKey = recommendedStudy.courseId
      ? `course:${recommendedStudy.courseId}`
      : recommendedStudy.resourceId
        ? `resource:${recommendedStudy.resourceId}`
        : `study:${recommendedStudy.title}`;
    seenTargets.add(targetKey);
    steps.push({
      id: `sprint-${targetKey}`,
      title:
        recommendedStudy.kind === 'course'
          ? recommendedStudy.entryTarget === 'resource' && recommendedStudy.resourceTitle
            ? `先通过资料继续《${recommendedStudy.title}》`
            : `先推进《${recommendedStudy.title}》`
          : `先继续《${recommendedStudy.title}》`,
      detail: recommendedStudy.detail,
      ctaLabel: recommendedStudy.ctaLabel,
      entryTarget: recommendedStudy.entryTarget,
      ...(recommendedStudy.courseId ? { courseId: recommendedStudy.courseId } : {}),
      ...(recommendedStudy.resourceId ? { resourceId: recommendedStudy.resourceId } : {}),
    });
  }

  if (recommendedReminder) {
    const targetKey = recommendedReminder.conversationId
      ? `conversation:${recommendedReminder.conversationId}`
      : recommendedReminder.notificationId
        ? `notification:${recommendedReminder.notificationId}`
        : `section:${recommendedReminder.section}`;

    if (!seenTargets.has(targetKey)) {
      seenTargets.add(targetKey);
      steps.push({
        id: `sprint-${targetKey}`,
        title: `再处理${recommendedReminder.section === 'conversations' ? '消息提醒' : '通知提醒'}`,
        detail: `${recommendedReminder.title} · ${recommendedReminder.detail}`,
        ctaLabel: recommendedReminder.ctaLabel,
        ...(recommendedReminder.conversationId ? { conversationId: recommendedReminder.conversationId } : {}),
        ...(recommendedReminder.notificationId ? { notificationId: recommendedReminder.notificationId } : {}),
      });
    }
  }

  if (nextTodayTask) {
    const targetKey = nextTodayTask.courseId
      ? `course:${nextTodayTask.courseId}`
      : nextTodayTask.resourceId
        ? `resource:${nextTodayTask.resourceId}`
      : nextTodayTask.conversationId
        ? `conversation:${nextTodayTask.conversationId}`
        : nextTodayTask.notificationId
          ? `notification:${nextTodayTask.notificationId}`
          : `task:${nextTodayTask.id}`;

    if (!seenTargets.has(targetKey)) {
      steps.push({
        id: `sprint-${targetKey}`,
        title: nextTodayTask.entryTarget === 'resource' && nextTodayTask.resourceId ? '最后通过资料收掉当前待办' : '最后收掉当前待办',
        detail: nextTodayTask.detail,
        ctaLabel: '打开当前待办',
        ...(nextTodayTask.entryTarget ? { entryTarget: nextTodayTask.entryTarget } : {}),
        ...(nextTodayTask.courseId ? { courseId: nextTodayTask.courseId } : {}),
        ...(nextTodayTask.resourceId ? { resourceId: nextTodayTask.resourceId } : {}),
        ...(nextTodayTask.conversationId ? { conversationId: nextTodayTask.conversationId } : {}),
        ...(nextTodayTask.notificationId ? { notificationId: nextTodayTask.notificationId } : {}),
      });
    }
  }

  return steps.slice(0, 3);
}

export function getProfileSprintSummary(steps: ProfileSprintStep[], completedStepIds: string[]): ProfileSprintSummary {
  const completedSteps = steps.filter((step) => completedStepIds.includes(step.id)).length;
  const remainingSteps = Math.max(steps.length - completedSteps, 0);
  const nextStep = steps.find((step) => !completedStepIds.includes(step.id)) ?? null;

  return {
    totalSteps: steps.length,
    completedSteps,
    remainingSteps,
    nextStepTitle: nextStep?.title ?? '今日冲刺已完成',
    nextStepDetail: nextStep?.detail ?? '当前推荐步骤都已完成，可以回到待办队列继续自由处理。',
  };
}
