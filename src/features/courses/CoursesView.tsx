import { useMemo } from 'react';
import { courseCategories, courses } from '../../data/mockData';
import { CommunityPostPreview, CourseCategory, CourseRuntimeRecord, CourseRuntimeState } from '../../types/app';
import { usePersistentState } from '../../hooks/usePersistentState';
import { CourseDetailView } from './CourseDetailView';
import { buildDisplayCourses, DisplayCourse, getContinueLearningCourses } from './courseState';

export function CoursesView({
  runtimeRecord,
  onUpdateRuntime,
  selectedCourseId,
  onSelectCourse,
  communityPosts,
  onOpenCommunityCourse,
}: {
  runtimeRecord: CourseRuntimeRecord;
  onUpdateRuntime: (courseId: string, updater: (current: CourseRuntimeState) => CourseRuntimeState) => void;
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null) => void;
  communityPosts: CommunityPostPreview[];
  onOpenCommunityCourse: (courseId: string, options?: { mode?: 'feed' | 'compose'; draft?: string }) => void;
}) {
  const [activeCategory, setActiveCategory] = usePersistentState<CourseCategory>('amas_courses_category', 'all');
  const [search, setSearch] = usePersistentState('amas_courses_search', '');

  const displayCourses = useMemo<DisplayCourse[]>(() => buildDisplayCourses(courses, runtimeRecord), [runtimeRecord]);

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

  if (selectedCourse) {
    return (
      <CourseDetailView
        course={selectedCourse}
        runtime={selectedCourse.runtime}
        progress={selectedCourse.progressValue}
        recentLesson={selectedCourse.recentLessonLabel}
        onBack={() => onSelectCourse(null)}
        onUpdateRuntime={(updater) => onUpdateRuntime(selectedCourse.id, updater)}
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
        </section>
      ) : (
        <section className="content-card">
          <div className="empty-state-card">
            <strong>当前筛选下没有课程</strong>
            <span>可以清空关键词，或者切换课程分类继续查找。</span>
          </div>
        </section>
      )}

      {continueLearningCourses.length > 0 && (
        <section className="continue-learning-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Continue Learning</p>
              <h2>继续学习</h2>
            </div>
          </div>
          <div className="continue-learning-grid">
            {continueLearningCourses.map((course) => (
              <button key={course.id} type="button" className="continue-learning-item" onClick={() => onSelectCourse(course.id)}>
                <span className="continue-learning-title">{course.title}</span>
                <span className="continue-learning-subtitle">{course.recentLessonLabel}</span>
                <span className="continue-learning-meta">{course.lastStudiedLabel}</span>
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
                讲师：{course.instructor} · {course.completedLessonsCount}/{course.syllabus.length} 课时完成 · 资料已读 {course.viewedMaterialsCount} 份 · {course.lastStudiedLabel}
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
