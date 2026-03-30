import { useMemo } from 'react';
import { courseCategories, courses } from '../../data/mockData';
import {
  CommunityPostPreview,
  CourseCategory,
  CourseRuntimeRecord,
  CourseRuntimeState,
  LibraryRuntimeRecord,
  LibraryRuntimeState,
  RuntimeSyncState,
} from '../../types/app';
import { useScopedPersistentState } from '../../hooks/usePersistentState';
import { CourseDetailView } from './CourseDetailView';
import { buildDisplayCourses, DisplayCourse, getContinueLearningCourses, getLearningOverview } from './courseState';

export function CoursesView({
  storageScopeKey,
  runtimeRecord,
  libraryRuntimeRecord,
  onUpdateRuntime,
  onUpdateLibraryRuntime,
  runtimeSyncState,
  selectedCourseId,
  onSelectCourse,
  communityPosts,
  onOpenResource,
  onOpenCommunityCourse,
}: {
  storageScopeKey: string;
  runtimeRecord: CourseRuntimeRecord;
  libraryRuntimeRecord: LibraryRuntimeRecord;
  onUpdateRuntime: (courseId: string, updater: (current: CourseRuntimeState) => CourseRuntimeState) => void;
  onUpdateLibraryRuntime: (
    resourceId: string,
    updater: (current: LibraryRuntimeState) => LibraryRuntimeState,
    source?: 'view' | 'favorite' | 'download' | 'restore',
  ) => void;
  runtimeSyncState: RuntimeSyncState | null;
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null) => void;
  communityPosts: CommunityPostPreview[];
  onOpenResource: (resourceId: string) => void;
  onOpenCommunityCourse: (courseId: string, options?: { mode?: 'feed' | 'compose'; draft?: string }) => void;
}) {
  const [activeCategory, setActiveCategory] = useScopedPersistentState<CourseCategory>(
    'amas_courses_category',
    storageScopeKey,
    'all',
  );
  const [search, setSearch] = useScopedPersistentState('amas_courses_search', storageScopeKey, '');

  const displayCourses = useMemo<DisplayCourse[]>(
    () => buildDisplayCourses(courses, runtimeRecord, libraryRuntimeRecord),
    [libraryRuntimeRecord, runtimeRecord],
  );

  const filteredCourses = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return displayCourses.filter((course) => {
      const categoryMatch = activeCategory === 'all' || course.category === activeCategory;
      if (!categoryMatch) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [course.title, course.instructor, course.summary, course.recentLessonLabel]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [activeCategory, displayCourses, search]);

  const selectedCourse = useMemo<DisplayCourse | null>(() => {
    if (!selectedCourseId) {
      return null;
    }

    return displayCourses.find((course) => course.id === selectedCourseId) ?? null;
  }, [displayCourses, selectedCourseId]);
  const selectedCoursePosts = useMemo(
    () => (selectedCourse ? communityPosts.filter((post) => post.courseId === selectedCourse.id) : []),
    [communityPosts, selectedCourse],
  );

  const highlightedCourse = filteredCourses[0] ?? null;
  const continueLearningCourses = useMemo(() => getContinueLearningCourses(displayCourses, 2), [displayCourses]);
  const learningOverview = useMemo(() => getLearningOverview(displayCourses), [displayCourses]);
  const courseTopics = useMemo(
    () =>
      courseCategories
        .filter((category) => category.key !== 'all')
        .map((category) => {
          const matches = displayCourses.filter((course) => course.category === category.key);
          return {
            ...category,
            count: matches.length,
            leadCourse: matches[0] ?? null,
          };
        })
        .filter((category) => category.count > 0),
    [displayCourses],
  );
  const featuredContinueCourse = continueLearningCourses[0] ?? highlightedCourse;

  if (selectedCourse) {
    return (
      <CourseDetailView
        course={selectedCourse}
        runtime={selectedCourse.runtime}
        progress={selectedCourse.progressValue}
        recentLesson={selectedCourse.recentLessonLabel}
        onBack={() => onSelectCourse(null)}
        runtimeSyncState={runtimeSyncState}
        onUpdateRuntime={(updater) => onUpdateRuntime(selectedCourse.id, updater)}
        libraryRuntimeRecord={libraryRuntimeRecord}
        onUpdateLibraryRuntime={onUpdateLibraryRuntime}
        onOpenResource={onOpenResource}
        communityPostCount={selectedCoursePosts.length}
        latestCommunityPost={selectedCoursePosts[0] ?? null}
        onOpenCommunity={() => onOpenCommunityCourse(selectedCourse.id)}
        onComposeCommunityPost={(draft) => onOpenCommunityCourse(selectedCourse.id, { mode: 'compose', draft })}
      />
    );
  }

  return (
    <div className="courses-layout">
      {highlightedCourse ? (
        <section className={`course-hero-card tone-${highlightedCourse.coverTone}`}>
          <div>
            <p className="eyebrow">Academic Programs</p>
            <h2>{highlightedCourse.title}</h2>
            <p className="hero-copy">{highlightedCourse.summary}</p>
          </div>
          <div className="course-hero-meta">
            <span>{highlightedCourse.degree}</span>
            <span>{highlightedCourse.lessons} 课时</span>
            <span>{highlightedCourse.progressValue}% 完成</span>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-btn compact-btn" onClick={() => onSelectCourse(highlightedCourse.id)}>
              {highlightedCourse.progressValue > 0 ? '继续当前课程' : '打开课程详情'}
            </button>
            {highlightedCourse.primaryLinkedResource ? (
              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={() => onOpenResource(highlightedCourse.primaryLinkedResource!.resourceId)}
              >
                {highlightedCourse.primaryLinkedResource.ctaLabel}
              </button>
            ) : featuredContinueCourse && featuredContinueCourse.id !== highlightedCourse.id ? (
              <button type="button" className="secondary-btn compact-btn" onClick={() => onSelectCourse(featuredContinueCourse.id)}>
                查看最近学习
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="content-card">
          <div className="empty-state-card">
            <strong>当前筛选下没有课程</strong>
            <span>可以清空关键词，或者切换课程分类继续查找。</span>
          </div>
        </section>
      )}

      {runtimeSyncState && (
        <section className="content-card sync-feedback-card">
          <p className="eyebrow">Progress Sync</p>
          <p
            className={`backup-feedback ${
              runtimeSyncState.tone === 'error'
                ? 'backup-feedback-error'
                : runtimeSyncState.tone === 'syncing'
                  ? 'backup-feedback-syncing'
                  : 'backup-feedback-success'
            }`}
          >
            {runtimeSyncState.message}
          </p>
        </section>
      )}

      <section className="summary-grid">
        <article className="summary-card">
          <span className="summary-label">课程总数</span>
          <strong>{displayCourses.length}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">进行中</span>
          <strong>{learningOverview.activeCourseCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已完成课时</span>
          <strong>{learningOverview.completedLessonCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">最近学习</span>
          <strong>{learningOverview.recentCourseTitle}</strong>
        </article>
      </section>

      {continueLearningCourses.length > 0 && (
        <section className="continue-learning-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Continue Learning</p>
              <h2>继续学习</h2>
              <p className="backup-feedback">回到你最近打开的课程，也可以直接跳回这门课当前最该继续的资料。</p>
            </div>
            <span className="post-badge">最近学习</span>
          </div>
          <div className="continue-learning-grid">
            {continueLearningCourses.map((course) => (
              <article key={course.id} className="continue-learning-item">
                <span className="continue-learning-title">{course.title}</span>
                <span className="continue-learning-subtitle">{course.recentLessonLabel}</span>
                <span className="continue-learning-meta">{course.lastStudiedLabel}</span>
                {course.primaryLinkedResource && (
                  <span className="continue-learning-meta">
                    资料：{course.primaryLinkedResource.resourceTitle} · {course.primaryLinkedResource.meta}
                  </span>
                )}
                <div className="lesson-actions">
                  <button type="button" className="primary-btn compact-btn" onClick={() => onSelectCourse(course.id)}>
                    继续课程
                  </button>
                  {course.primaryLinkedResource && (
                    <button
                      type="button"
                      className="secondary-btn compact-btn"
                      onClick={() => onOpenResource(course.primaryLinkedResource!.resourceId)}
                    >
                      {course.primaryLinkedResource.ctaLabel}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {courseTopics.length > 0 && (
        <section className="content-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Course Topics</p>
              <h2>课程专题</h2>
            </div>
            <span className="post-badge">{courseTopics.length} 个方向</span>
          </div>
          <p className="backup-feedback">先按课程方向整理入口，后面继续把恢复快照里的课程总览和分类层级逐步搬回源码版。</p>
          <div className="course-topic-grid">
            {courseTopics.map((topic) => (
              <button
                key={topic.key}
                type="button"
                className={`course-topic-card ${activeCategory === topic.key ? 'active' : ''}`}
                onClick={() => setActiveCategory(topic.key)}
              >
                <div className="course-topic-meta">
                  <span className="post-badge">{topic.count} 门课程</span>
                  <span className="course-updated">{topic.leadCourse?.degree ?? '课程方向'}</span>
                </div>
                <strong>{topic.label}</strong>
                <span>{topic.leadCourse?.title ?? '继续补充该方向的课程内容。'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="toolbar-card">
        <label className="search-field" htmlFor="course-search">
          <span>搜索课程</span>
          <input
            id="course-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="输入课程名、讲师或课题"
          />
        </label>
        <div className="category-row">
          {courseCategories.map((category) => (
            <button
              key={category.key}
              type="button"
              className={category.key === activeCategory ? 'chip-btn active' : 'chip-btn'}
              onClick={() => setActiveCategory(category.key)}
            >
              {category.label}
            </button>
          ))}
        </div>
        <p className="backup-feedback">
          当前显示 {filteredCourses.length} 门课程
          {activeCategory !== 'all' ? ` · 已切换到 ${courseCategories.find((item) => item.key === activeCategory)?.label}` : ''}
          {search.trim() ? ` · 关键词“${search.trim()}”` : ''}
        </p>
      </section>

      <section className="course-list">
        {filteredCourses.length > 0 ? (
          filteredCourses.map((course) => (
            <article className="course-card" key={course.id}>
              <div className="course-card-top">
                <div>
                  <p className="course-degree">{course.degree}</p>
                  <h3>{course.title}</h3>
                </div>
                <span className="course-updated">{course.updatedAt}</span>
              </div>
              <p className="course-summary">{course.summary}</p>
              <div className="course-progress-row">
                <div className="progress-meta">
                  <strong>{course.progressValue}%</strong>
                  <span>最近学习：{course.recentLessonLabel}</span>
                </div>
                <button type="button" className="primary-btn compact-btn" onClick={() => onSelectCourse(course.id)}>
                  {course.actionLabel}
                </button>
              </div>
              <div className="progress-bar">
                <span style={{ width: `${course.progressValue}%` }} />
              </div>
              <p className="course-footer">
                讲师：{course.instructor} · {course.completedLessonsCount}/{course.syllabus.length} 课时完成 · 已接图书馆 {course.linkedMaterialsCount} 份 · 阅读中 {course.inProgressMaterialsCount} 份 · 已下载 {course.downloadedMaterialsCount} 份 · {course.lastStudiedLabel}
              </p>
            </article>
          ))
        ) : (
          <div className="empty-state-card">
            <strong>没有匹配的课程结果</strong>
            <span>试试课程名、讲师或最近课题关键词。</span>
          </div>
        )}
      </section>
    </div>
  );
}
