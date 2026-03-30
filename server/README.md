# AMAS Local API

This is the local development API for the AMAS Seminary rebuild.

## Start

```bash
npm run api
```

The server listens on `http://127.0.0.1:8787` by default. Override the port with `AMAS_API_PORT`.
Use `AMAS_API_DATA_DIR` when you want an isolated data directory for tests.
Use `AMAS_API_SESSION_TTL_MS` when you want short-lived sessions for expiry and re-login testing.

## Use with the app

```bash
VITE_APP_GATEWAY_MODE=remote VITE_API_BASE_URL=http://127.0.0.1:8787 npm run dev
```

## Smoke check

```bash
npm run smoke:remote
```

This starts the API in an isolated temp directory and verifies auth, profile, course runtime, library runtime, sync, and logout.

```bash
npm run smoke:remote:recovery
```

This verifies restart persistence and a full snapshot write-back after the API comes back online.

```bash
npm run smoke:remote:expiry
```

This verifies session TTL expiry, stale cookie clearing, protected-write rejection, and re-login recovery.

The auth API also supports `POST /auth/refresh` for extending an active remote session before it expires.

## Persistence

- Domain snapshot: `server/data/app-domain-snapshot.json`
- Professor applications: `server/data/professor-applications.json`
