import { useMemo, useState } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { BottomNav } from './components/layout/BottomNav';
import { HomeView } from './features/home/HomeView';
import { CoursesView } from './features/courses/CoursesView';
import { CommunityView } from './features/community/CommunityView';
import { LibraryView } from './features/library/LibraryView';
import { ProfileView } from './features/profile/ProfileView';
import { usePersistentState } from './hooks/usePersistentState';
import {
  AppBackupPayload,
  CommunityNotification,
  CommunityPostPreview,
  ConversationPreview,
  CourseRuntimeRecord,
  CourseRuntimeState,
  LibraryRuntimeRecord,
  LibraryRuntimeState,
  ProfileState,
  TabKey,
} from './types/app';
import {
  communityConversations,
  communityNotifications,
  communityPosts,
  courses,
  defaultProfile,
  rebuildMilestones,
  libraryResources,
} from './data/mockData';
import {
  buildDisplayCourses,
  completeNextPendingLesson,
  createInitialCourseRuntime,
  getContinueLearningCourses,
  getLearningOverview,
} from './features/courses/courseState';
import { createInitialLibraryRuntime, getLibraryOverview, getRecentViewedResources } from './features/library/libraryState';
import { createAppBackupPayload } from './services/appBackup';

type CommunityCourseFocus = {
  courseId: string;
  token: number;
  mode: 'feed' | 'compose';
  draft?: string;
};

type CommunityInboxIntent = {
  token: number;
  section: 'conversations' | 'notifications';
  conversationId?: string;
  notificationId?: string;
};

function App() {
  const [communityCourseFocus, setCommunityCourseFocus] = useState<CommunityCourseFocus | null>(null);
  const [communityInboxIntent, setCommunityInboxIntent] = useState<CommunityInboxIntent | null>(null);
  const [activeTab, setActiveTab] = usePersistentState<TabKey>('amas_rebuild_active_tab', 'home');
  const [selectedCourseId, setSelectedCourseId] = usePersistentState<string | null>('amas_courses_selected_course', null);
  const [selectedResourceId, setSelectedResourceId] = usePersistentState<string | null>('amas_library_selected_resource', null);
  const [runtimeRecord, setRuntimeRecord] = usePersistentState<CourseRuntimeRecord>(
    'amas_courses_runtime',
    createInitialCourseRuntime(courses),
  );
  const [libraryRuntimeRecord, setLibraryRuntimeRecord] = usePersistentState<LibraryRuntimeRecord>(
    'amas_library_runtime',
    createInitialLibraryRuntime(libraryResources),
  );
  const [profile, setProfile] = usePersistentState<ProfileState>('amas_profile_state', defaultProfile);
  const [posts, setPosts] = usePersistentState<CommunityPostPreview[]>('amas_community_posts', communityPosts);
  const [conversations, setConversations] = usePersistentState<ConversationPreview[]>(
    'amas_community_conversations',
    communityConversations,
  );
  const [notifications, setNotifications] = usePersistentState<CommunityNotification[]>(
    'amas_community_notifications',
    communityNotifications,
  );

  const displayCourses = useMemo(() => buildDisplayCourses(courses, runtimeRecord), [runtimeRecord]);
  const continueLearningCourses = useMemo(() => getContinueLearningCourses(displayCourses, 3), [displayCourses]);
  const learningOverview = useMemo(() => getLearningOverview(displayCourses), [displayCourses]);
  const recentViewedResources = useMemo(() => getRecentViewedResources(libraryResources, libraryRuntimeRecord), [libraryRuntimeRecord]);
  const libraryOverview = useMemo(() => getLibraryOverview(libraryRuntimeRecord), [libraryRuntimeRecord]);
  const communityUnreadCount = useMemo(
    () => conversations.reduce((sum, item) => sum + item.unread, 0) + notifications.filter((item) => !item.read).length,
    [conversations, notifications],
  );
  const getBackupPayload = () =>
    createAppBackupPayload({
      profile,
      courseRuntime: runtimeRecord,
      libraryRuntime: libraryRuntimeRecord,
    });

  const openCourse = (courseId: string) => {
    setActiveTab('courses');
    setSelectedCourseId(courseId);
  };

  const openResource = (resourceId: string) => {
    setActiveTab('library');
    setSelectedResourceId(resourceId);
  };

  const openProfile = () => {
    setActiveTab('profile');
  };

  const openCommunityForCourse = (
    courseId: string,
    options: {
      mode?: CommunityCourseFocus['mode'];
      draft?: string;
    } = {},
  ) => {
    setCommunityInboxIntent(null);
    setCommunityCourseFocus({
      courseId,
      token: Date.now(),
      mode: options.mode ?? 'feed',
      ...(options.draft ? { draft: options.draft } : undefined),
    });
    setActiveTab('community');
  };

  const openCommunityInbox = (
    options: {
      section?: CommunityInboxIntent['section'];
      conversationId?: string;
      notificationId?: string;
    } = {},
  ) => {
    setCommunityCourseFocus(null);
    setCommunityInboxIntent({
      token: Date.now(),
      section: options.section ?? 'notifications',
      ...(options.conversationId ? { conversationId: options.conversationId } : undefined),
      ...(options.notificationId ? { notificationId: options.notificationId } : undefined),
    });
    setActiveTab('community');
  };

  const updateCourseRuntime = (courseId: string, updater: (current: CourseRuntimeState) => CourseRuntimeState) => {
    setRuntimeRecord((current) => {
      const course = courses.find((item) => item.id === courseId);
      if (!course) {
        return current;
      }

      const runtime = current[courseId] ?? createInitialCourseRuntime([course])[courseId];
      return {
        ...current,
        [courseId]: updater(runtime),
      };
    });
  };

  const updateLibraryRuntime = (resourceId: string, updater: (current: LibraryRuntimeState) => LibraryRuntimeState) => {
    setLibraryRuntimeRecord((current) => {
      const runtime =
        current[resourceId] ?? {
          favorite: false,
          viewed: false,
          downloaded: false,
          lastViewedAt: null,
        };

      return {
        ...current,
        [resourceId]: updater(runtime),
      };
    });
  };

  const quickCompleteCourseTask = (courseId: string) => {
    const course = courses.find((item) => item.id === courseId);
    if (!course) {
      return;
    }

    updateCourseRuntime(courseId, (current) => completeNextPendingLesson(course, current));
  };

  const markConversationRead = (conversationId: string) => {
    setConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item)));
    setNotifications((current) =>
      current.map((item) => (item.conversationId === conversationId ? { ...item, read: true } : item)),
    );
  };

  const markNotificationRead = (notificationId: string) => {
    setNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
  };

  const clearReminderTasks = () => {
    setConversations((current) => current.map((item) => ({ ...item, unread: 0 })));
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  };

  const restoreBackup = (payload: AppBackupPayload) => {
    setProfile(payload.profile);
    setRuntimeRecord(payload.courseRuntime);
    setLibraryRuntimeRecord(payload.libraryRuntime);
    setSelectedCourseId(null);
    setSelectedResourceId(null);
    setActiveTab('profile');
  };

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeView
            profileName={profile.name}
            displayCourses={displayCourses}
            continueLearningCourses={continueLearningCourses}
            learningOverview={learningOverview}
            recentViewedResources={recentViewedResources}
            libraryViewedCount={libraryOverview.viewedCount}
            conversations={conversations}
            notifications={notifications}
            onOpenCourse={openCourse}
            onOpenResource={openResource}
            onOpenProfile={openProfile}
            onOpenCommunityInbox={openCommunityInbox}
          />
        );
      case 'courses':
        return (
          <CoursesView
            runtimeRecord={runtimeRecord}
            onUpdateRuntime={updateCourseRuntime}
            selectedCourseId={selectedCourseId}
            onSelectCourse={setSelectedCourseId}
            communityPosts={posts}
            onOpenCommunityCourse={openCommunityForCourse}
          />
        );
      case 'community':
        return (
          <CommunityView
            onOpenCourse={openCourse}
            onOpenResource={openResource}
            courseFocus={communityCourseFocus}
            inboxIntent={communityInboxIntent}
            posts={posts}
            onUpdatePosts={setPosts}
            conversations={conversations}
            onUpdateConversations={setConversations}
            notifications={notifications}
            onUpdateNotifications={setNotifications}
          />
        );
      case 'library':
        return (
          <LibraryView
            runtimeRecord={libraryRuntimeRecord}
            onUpdateRuntime={updateLibraryRuntime}
            onOpenCourse={openCourse}
            onOpenCommunityCourse={openCommunityForCourse}
            communityPosts={posts}
            selectedResourceId={selectedResourceId}
            onSelectResource={setSelectedResourceId}
          />
        );
      case 'profile':
        return (
          <ProfileView
            profile={profile}
            onUpdateProfile={setProfile}
            displayCourses={displayCourses}
            libraryRuntimeRecord={libraryRuntimeRecord}
            rebuildMilestones={rebuildMilestones}
            continueLearningCourses={continueLearningCourses}
            learningOverview={learningOverview}
            recentViewedResources={recentViewedResources}
            communityPosts={posts}
            conversations={conversations}
            notifications={notifications}
            recentCommunityPosts={posts.slice(0, 2)}
            libraryViewedCount={libraryOverview.viewedCount}
            libraryFavoriteCount={libraryOverview.favoriteCount}
            createBackupPayload={getBackupPayload}
            onRestoreBackup={restoreBackup}
            onOpenCourse={openCourse}
            onOpenResource={openResource}
            onOpenCommunityCourse={openCommunityForCourse}
            onOpenCommunityInbox={openCommunityInbox}
            onQuickCompleteCourseTask={quickCompleteCourseTask}
            onMarkConversationRead={markConversationRead}
            onMarkNotificationRead={markNotificationRead}
            onClearReminderTasks={clearReminderTasks}
          />
        );
      default:
        return null;
    }
  }, [
    activeTab,
    continueLearningCourses,
    learningOverview,
    recentViewedResources,
    libraryOverview.viewedCount,
    libraryOverview.favoriteCount,
    profile,
    runtimeRecord,
    selectedCourseId,
    selectedResourceId,
    libraryRuntimeRecord,
    posts,
    conversations,
    notifications,
    communityCourseFocus,
    communityInboxIntent,
  ]);

  return (
    <div className="app-shell">
      <AppHeader activeTab={activeTab} />
      <main className="app-main">{tabContent}</main>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} badgeCounts={{ community: communityUnreadCount }} />
    </div>
  );
}

export default App;
