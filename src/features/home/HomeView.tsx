import { LibraryResource } from '../../types/app';
import { StatusBadge } from '../../components/common/StatusBadge';
import { modules, rebuildMilestones } from '../../data/mockData';
import { DisplayCourse, LearningOverview } from '../courses/courseState';

export function HomeView({
  continueLearningCourses,
  learningOverview,
  recentViewedResources,
  libraryViewedCount,
  onOpenCourse,
  onOpenResource,
}: {
  continueLearningCourses: DisplayCourse[];
  learningOverview: LearningOverview;
  recentViewedResources: LibraryResource[];
  libraryViewedCount: number;
  onOpenCourse: (courseId: string) => void;
  onOpenResource: (resourceId: string) => void;
}) {
  return (
    <>
      <section className="hero-card">
        <div>
          <p className="eyebrow">AMAS Seminary</p>
          <h2>源码恢复工作区已建立</h2>
          <p className="hero-copy">
            当前仓库已经从“只有运行包”恢复为“可继续开发”的源码工程。课程模块已经进入可交互状态，接下来会继续恢复校友圈、聊天和个人中心。
          </p>
        </div>
        <div className="hero-actions">
          <a className="primary-btn" href="/recovered/index.html" target="_blank" rel="noreferrer">
            打开恢复快照
          </a>
          <a className="secondary-btn" href="https://github.com/new" target="_blank" rel="noreferrer">
            创建远程仓库
          </a>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span className="summary-label">进行中课程</span>
          <strong>{learningOverview.activeCourseCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已完成课时</span>
          <strong>{learningOverview.completedLessonCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已读资料</span>
          <strong>{learningOverview.viewedMaterialCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">图书馆已查看</span>
          <strong>{libraryViewedCount}</strong>
        </article>
      </section>

      {continueLearningCourses.length > 0 && (
        <section className="continue-learning-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Recent Study</p>
              <h2>最近学习</h2>
            </div>
          </div>
          <div className="continue-learning-grid">
            {continueLearningCourses.map((course) => (
              <button key={course.id} type="button" className="continue-learning-item" onClick={() => onOpenCourse(course.id)}>
                <span className="continue-learning-title">{course.title}</span>
                <span className="continue-learning-subtitle">{course.recentLessonLabel}</span>
                <span className="continue-learning-meta">{course.lastStudiedLabel}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recentViewedResources.length > 0 && (
        <section className="content-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Recent Resources</p>
              <h2>最近查看资源</h2>
            </div>
          </div>
          <div className="archive-list">
            {recentViewedResources.map((resource) => (
              <button key={resource.id} type="button" className="archive-item" onClick={() => onOpenResource(resource.id)}>
                <div>
                  <p className="post-author">{resource.title}</p>
                  <p className="post-role">
                    {resource.author} · {resource.format}
                  </p>
                </div>
                <div className="archive-meta">
                  <strong>{resource.updatedAt}</strong>
                  <span>{resource.relatedCourseId ? '可联动到相关课程资料' : '返回图书馆可继续查看详情与收藏状态'}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="milestone-grid">
        {rebuildMilestones.map((item) => (
          <article className="milestone-card" key={item.title}>
            <p className="milestone-title">{item.title}</p>
            <p className="milestone-detail">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="panel-grid">
        {modules.map((module) => (
          <article className="module-card" key={module.id}>
            <div className="module-header">
              <h2>{module.title}</h2>
              <StatusBadge status={module.status} />
            </div>
            <p>{module.summary}</p>
          </article>
        ))}
      </section>
    </>
  );
}
