import { AppDomainSnapshot, AuthSession } from '../types/app';
import {
  AppServiceContracts,
  CourseRuntimeSyncInput,
  LibraryRuntimeSyncInput,
  ProfessorApplicationInput,
  ProfessorApplicationReceipt,
  StudentAuthInput,
} from './appContracts';
import {
  createDefaultAppDomainSnapshot,
  normalizeAppDomainSnapshot,
  readAppDomainSnapshot,
  writeAppDomainSnapshot,
} from './appRepository';

const localGatewayStorageKey = 'amas_local_gateway_state_v1';
const anonymousAccount = '__anonymous__';
const localSessionTtlMs = 1000 * 60 * 60 * 12;

type LocalGatewayState = {
  version: 1;
  currentSession: AuthSession | null;
  snapshotsByAccount: Record<string, AppDomainSnapshot>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStorageValue<T>(key: string): T | null {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in rebuild shell.
  }
}

function buildAuthSession(input: StudentAuthInput): AuthSession {
  const lastAuthenticatedAt = new Date().toISOString();
  return {
    account: input.account.trim(),
    role: 'student',
    degree: input.degree,
    lastAuthenticatedAt,
    expiresAt: new Date(Date.parse(lastAuthenticatedAt) + localSessionTtlMs).toISOString(),
  };
}

function refreshAuthSession(session: AuthSession): AuthSession {
  const lastAuthenticatedAt = new Date().toISOString();
  return {
    ...session,
    lastAuthenticatedAt,
    expiresAt: new Date(Date.parse(lastAuthenticatedAt) + localSessionTtlMs).toISOString(),
  };
}

function createProfessorReceipt(_input: ProfessorApplicationInput): ProfessorApplicationReceipt {
  return {
    submittedAt: new Date().toISOString(),
    status: 'submitted',
  };
}

function resolveAccountKey(account: string | null | undefined) {
  return account?.trim() || anonymousAccount;
}

function normalizeStoredSnapshot(snapshot: unknown) {
  return normalizeAppDomainSnapshot({
    ...normalizeAppDomainSnapshot(snapshot),
    authSession: null,
  });
}

function createSeedSnapshot(input: StudentAuthInput, snapshot?: AppDomainSnapshot | null, forceIdentity = false) {
  const baseSnapshot = normalizeStoredSnapshot(snapshot ?? createDefaultAppDomainSnapshot());
  const shouldApplyIdentity = forceIdentity || !snapshot;

  return normalizeAppDomainSnapshot({
    ...baseSnapshot,
    authSession: null,
    profile: {
      ...baseSnapshot.profile,
      name: shouldApplyIdentity ? input.displayName : baseSnapshot.profile.name,
      role: shouldApplyIdentity ? `${input.degree} 学员` : baseSnapshot.profile.role,
      email: input.account.trim(),
    },
  });
}

function normalizeLocalGatewayState(value: unknown): LocalGatewayState {
  if (!isRecord(value) || !isRecord(value.snapshotsByAccount)) {
    return {
      version: 1,
      currentSession: null,
      snapshotsByAccount: {},
    };
  }

  return {
    version: 1,
    currentSession: value.currentSession === null || isRecord(value.currentSession) ? (value.currentSession as AuthSession | null) : null,
    snapshotsByAccount: Object.fromEntries(
      Object.entries(value.snapshotsByAccount).map(([account, snapshot]) => [account, normalizeStoredSnapshot(snapshot)]),
    ),
  };
}

function getCurrentAccount(state: LocalGatewayState) {
  return state.currentSession?.account ?? null;
}

function getSnapshotForAccount(state: LocalGatewayState, account: string | null | undefined) {
  const accountKey = resolveAccountKey(account);
  return normalizeStoredSnapshot(state.snapshotsByAccount[accountKey] ?? createDefaultAppDomainSnapshot());
}

function buildResponseSnapshot(state: LocalGatewayState, account: string | null | undefined) {
  return normalizeAppDomainSnapshot({
    ...getSnapshotForAccount(state, account),
    authSession: account ? state.currentSession : null,
  });
}

function saveLocalGatewayState(state: LocalGatewayState) {
  const normalizedState = normalizeLocalGatewayState(state);
  writeStorageValue(localGatewayStorageKey, normalizedState);
  writeAppDomainSnapshot(buildResponseSnapshot(normalizedState, getCurrentAccount(normalizedState)));
  return normalizedState;
}

function createMigratedGatewayState(): LocalGatewayState {
  const snapshot = readAppDomainSnapshot();
  const migratedState = {
    version: 1,
    currentSession: snapshot.authSession,
    snapshotsByAccount: {
      [resolveAccountKey(snapshot.authSession?.account ?? snapshot.profile.email ?? null)]: normalizeStoredSnapshot(snapshot),
    },
  } satisfies LocalGatewayState;

  return saveLocalGatewayState(migratedState);
}

function readLocalGatewayState() {
  const storedState = readStorageValue<LocalGatewayState>(localGatewayStorageKey);
  if (!storedState) {
    return createMigratedGatewayState();
  }

  const normalizedState = normalizeLocalGatewayState(storedState);
  writeAppDomainSnapshot(buildResponseSnapshot(normalizedState, getCurrentAccount(normalizedState)));
  return normalizedState;
}

function persistAccountSnapshot(
  state: LocalGatewayState,
  account: string | null | undefined,
  snapshot: AppDomainSnapshot,
  nextSession = state.currentSession,
) {
  return saveLocalGatewayState({
    ...state,
    currentSession: nextSession,
    snapshotsByAccount: {
      ...state.snapshotsByAccount,
      [resolveAccountKey(account)]: normalizeStoredSnapshot(snapshot),
    },
  });
}

export const localAppGateway: AppServiceContracts = {
  auth: {
    async readSession() {
      return readLocalGatewayState().currentSession;
    },
    async refreshSession() {
      const state = readLocalGatewayState();
      if (!state.currentSession) {
        throw new Error('Authentication required.');
      }

      const nextSession = refreshAuthSession(state.currentSession);
      saveLocalGatewayState({
        ...state,
        currentSession: nextSession,
      });

      return nextSession;
    },
    async login(input) {
      const state = readLocalGatewayState();
      const nextSession = buildAuthSession(input);
      const accountKey = resolveAccountKey(nextSession.account);
      const nextState = saveLocalGatewayState({
        ...state,
        currentSession: nextSession,
        snapshotsByAccount: {
          ...state.snapshotsByAccount,
          [accountKey]: createSeedSnapshot(input, state.snapshotsByAccount[accountKey]),
        },
      });

      return nextState.currentSession as AuthSession;
    },
    async register(input) {
      const state = readLocalGatewayState();
      const accountKey = resolveAccountKey(input.account);
      if (state.snapshotsByAccount[accountKey]) {
        throw new Error('Account already exists.');
      }

      const nextSession = buildAuthSession(input);
      const nextState = saveLocalGatewayState({
        ...state,
        currentSession: nextSession,
        snapshotsByAccount: {
          ...state.snapshotsByAccount,
          [accountKey]: createSeedSnapshot(input, null, true),
        },
      });

      return nextState.currentSession as AuthSession;
    },
    async logout() {
      saveLocalGatewayState({
        ...readLocalGatewayState(),
        currentSession: null,
      });

      return null;
    },
    async submitProfessorApplication(input) {
      return createProfessorReceipt(input);
    },
  },
  profile: {
    async read() {
      const state = readLocalGatewayState();
      return buildResponseSnapshot(state, getCurrentAccount(state)).profile;
    },
    async update(input) {
      const state = readLocalGatewayState();
      const account = getCurrentAccount(state);
      const nextSnapshot = normalizeAppDomainSnapshot({
        ...getSnapshotForAccount(state, account),
        profile: input,
      });

      persistAccountSnapshot(state, account, nextSnapshot);
      return nextSnapshot.profile;
    },
  },
  learning: {
    async readCourseRuntime() {
      const state = readLocalGatewayState();
      return buildResponseSnapshot(state, getCurrentAccount(state)).courseRuntime;
    },
    async updateCourseRuntime(input: CourseRuntimeSyncInput) {
      const state = readLocalGatewayState();
      const account = getCurrentAccount(state);
      const snapshot = getSnapshotForAccount(state, account);
      const nextSnapshot = normalizeAppDomainSnapshot({
        ...snapshot,
        courseRuntime: {
          ...snapshot.courseRuntime,
          [input.courseId]: input.runtime,
        },
      });

      persistAccountSnapshot(state, account, nextSnapshot);
      return nextSnapshot.courseRuntime;
    },
  },
  library: {
    async readLibraryRuntime() {
      const state = readLocalGatewayState();
      return buildResponseSnapshot(state, getCurrentAccount(state)).libraryRuntime;
    },
    async updateLibraryRuntime(input: LibraryRuntimeSyncInput) {
      const state = readLocalGatewayState();
      const account = getCurrentAccount(state);
      const snapshot = getSnapshotForAccount(state, account);
      const nextSnapshot = normalizeAppDomainSnapshot({
        ...snapshot,
        libraryRuntime: {
          ...snapshot.libraryRuntime,
          [input.resourceId]: input.runtime,
        },
      });

      persistAccountSnapshot(state, account, nextSnapshot);
      return nextSnapshot.libraryRuntime;
    },
  },
  sync: {
    async readSnapshot() {
      const state = readLocalGatewayState();
      return buildResponseSnapshot(state, getCurrentAccount(state));
    },
    async writeSnapshot(snapshot) {
      const state = readLocalGatewayState();
      const targetSession = snapshot.authSession ?? state.currentSession;
      const nextState = persistAccountSnapshot(state, targetSession?.account ?? null, snapshot, targetSession);

      return buildResponseSnapshot(nextState, targetSession?.account ?? null);
    },
  },
};
