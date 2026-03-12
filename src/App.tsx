import { useMemo } from 'react';
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
  CourseRuntimeRecord,
  CourseRuntimeState,
  LibraryRuntimeRecord,
  LibraryRuntimeState,
  ProfileState,
  TabKey,
} from './types/app';
import { courses, defaultProfile, rebuildMilestones, libraryResources } from './data/mockData';
import { buildDisplayCourses, createInitialCourseRuntime, getContinueLearningCourses, getLearningOverview } from './features/courses/courseState';
import { createInitialLibraryRuntime, getLibraryOverview, getRecentViewedResources } from './features/library/libraryState';
import { createAppBackupPayload } from './services/appBackup';

function App() {
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

  const displayCourses = useMemo(() => buildDisplayCourses(courses, runtimeRecord), [runtimeRecord]);
  const continueLearningCourses = useMemo(() => getContinueLearningCourses(displayCourses, 3), [displayCourses]);
  const learningOverview = useMemo(() => getLearningOverview(displayCourses), [displayCourses]);
  const recentViewedResources = useMemo(() => getRecentViewedResources(libraryResources, libraryRuntimeRecord), [libraryRuntimeRecord]);
  const libraryOverview = useMemo(() => getLibraryOverview(libraryRuntimeRecord), [libraryRuntimeRecord]);
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
            continueLearningCourses={continueLearningCourses}
            learningOverview={learningOverview}
            recentViewedResources={recentViewedResources}
            libraryViewedCount={libraryOverview.viewedCount}
            onOpenCourse={openCourse}
            onOpenResource={openResource}
          />
        );
      case 'courses':
        return (
          <CoursesView
            runtimeRecord={runtimeRecord}
            onUpdateRuntime={updateCourseRuntime}
            selectedCourseId={selectedCourseId}
            onSelectCourse={setSelectedCourseId}
          />
        );
      case 'community':
        return <CommunityView onOpenCourse={openCourse} />;
      case 'library':
        return (
          <LibraryView
            runtimeRecord={libraryRuntimeRecord}
            onUpdateRuntime={updateLibraryRuntime}
            onOpenCourse={openCourse}
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
            rebuildMilestones={rebuildMilestones}
            continueLearningCourses={continueLearningCourses}
            learningOverview={learningOverview}
            recentViewedResources={recentViewedResources}
            libraryViewedCount={libraryOverview.viewedCount}
            libraryFavoriteCount={libraryOverview.favoriteCount}
            createBackupPayload={getBackupPayload}
            onRestoreBackup={restoreBackup}
            onOpenCourse={openCourse}
            onOpenResource={openResource}
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
  ]);

  return (
    <div className="app-shell">
      <AppHeader activeTab={activeTab} />
      <main className="app-main">{tabContent}</main>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}

export default App;
