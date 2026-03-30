import { AppDomainSnapshot, AuthSession, CourseRuntimeRecord, LibraryRuntimeRecord, ProfileState } from '../types/app';
import {
  AppServiceContracts,
  CourseRuntimeSyncInput,
  LibraryRuntimeSyncInput,
  ProfessorApplicationInput,
  ProfessorApplicationReceipt,
  StudentAuthInput,
} from './appContracts';
import { normalizeAppDomainSnapshot } from './appRepository';

type RequestOptions = {
  allowEmpty?: boolean;
};

function trimBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function parseJsonResponse<T>(response: Response, options: RequestOptions = {}): Promise<T> {
  const raw = response.status === 204 ? '' : await response.text();

  if (!response.ok) {
    let message = `HTTP ${response.status}: ${response.statusText}`;

    if (raw) {
      try {
        const payload = JSON.parse(raw) as { error?: string };
        if (typeof payload.error === 'string' && payload.error.trim()) {
          message = payload.error;
        }
      } catch {
        message = raw;
      }
    }

    throw new Error(message);
  }

  if (response.status === 204 || options.allowEmpty) {
    return null as T;
  }

  return raw ? (JSON.parse(raw) as T) : (null as T);
}

export function createHttpAppGateway(baseUrl: string): AppServiceContracts {
  const normalizedBaseUrl = trimBaseUrl(baseUrl);

  const requestJson = async <T>(
    path: string,
    init?: RequestInit,
    options?: RequestOptions,
  ): Promise<T> => {
    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    return parseJsonResponse<T>(response, options);
  };

  return {
    auth: {
      readSession() {
        return requestJson<AuthSession | null>('/auth/session');
      },
      refreshSession() {
        return requestJson<AuthSession>('/auth/refresh', {
          method: 'POST',
        });
      },
      login(input: StudentAuthInput) {
        return requestJson('/auth/login', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      },
      register(input: StudentAuthInput) {
        return requestJson('/auth/register', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      },
      logout() {
        return requestJson('/auth/logout', { method: 'POST' }, { allowEmpty: true });
      },
      submitProfessorApplication(input: ProfessorApplicationInput) {
        return requestJson<ProfessorApplicationReceipt>('/auth/professor-applications', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      },
    },
    profile: {
      read() {
        return requestJson<ProfileState>('/profile');
      },
      update(input: ProfileState) {
        return requestJson<ProfileState>('/profile', {
          method: 'PUT',
          body: JSON.stringify(input),
        });
      },
    },
    learning: {
      readCourseRuntime() {
        return requestJson<CourseRuntimeRecord>('/learning/course-runtime');
      },
      updateCourseRuntime(input: CourseRuntimeSyncInput) {
        return requestJson<CourseRuntimeRecord>(`/learning/course-runtime/${input.courseId}`, {
          method: 'PUT',
          body: JSON.stringify(input),
        });
      },
    },
    library: {
      readLibraryRuntime() {
        return requestJson<LibraryRuntimeRecord>('/library/runtime');
      },
      updateLibraryRuntime(input: LibraryRuntimeSyncInput) {
        return requestJson<LibraryRuntimeRecord>(`/library/runtime/${input.resourceId}`, {
          method: 'PUT',
          body: JSON.stringify(input),
        });
      },
    },
    sync: {
      async readSnapshot() {
        const snapshot = await requestJson<AppDomainSnapshot>('/sync/snapshot');
        return normalizeAppDomainSnapshot(snapshot);
      },
      async writeSnapshot(snapshot: AppDomainSnapshot) {
        const nextSnapshot = await requestJson<AppDomainSnapshot>('/sync/snapshot', {
          method: 'PUT',
          body: JSON.stringify(snapshot),
        });
        return normalizeAppDomainSnapshot(nextSnapshot);
      },
    },
  };
}
