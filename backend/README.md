# Shramic Local Backend

This backend provides authentication and database storage for the Shramic Local app.

## Start server

```bash
npm start
```

Open `http://localhost:3000` in a browser, register or log in, then use the
dashboard. The dashboard loads and saves jobs, applications, profile changes,
and payment records through this API. A valid login is required.

## Deploy to Vercel

1. Push the project to a GitHub repository and import it into Vercel.
2. Add a Neon Postgres database through Vercel Marketplace (or create a Neon
   database separately) and set `POSTGRES_URL` in Vercel's project environment
   variables.
3. Set `JWT_SECRET` to a long, random secret in the Vercel environment
   variables. Do not use the local development fallback.
4. Deploy. Vercel builds the frontend from `www/` and routes `/api/*` to the
   serverless Express API. The API creates the database tables on first request.

Use the project root as the Vercel Root Directory. The included
`vercel.json` sets the build command and output directory.

The SQLite database is only a local-development fallback. Vercel deployments
require Postgres because serverless function filesystems are not persistent.
Existing local SQLite records are not automatically copied to Postgres.

## Android APK

The Android project is already generated in `android/`. Install Android Studio
and its Android SDK, then from the project directory run:

```bash
npm install
npm run android:sync
npm run android:open
```

In Android Studio, build a debug APK using **Build > Build Bundle(s) / APK(s) >
Build APK(s)**. Or, on Windows, run `npm run android:build:debug`. The debug
APK will be created at `android/app/build/outputs/apk/debug/app-debug.apk`.
After changing frontend files, run `npm run android:sync` before rebuilding.

The API must be reachable by the phone over HTTPS. In the APK login screen,
enter the HTTPS URL where this backend is hosted. `localhost` on a phone means
the phone itself, not the computer running the backend. Do not expose the
development server over plain HTTP for real accounts.

## API overview

- GET /
- POST /api/register
- POST /api/login
- GET /api/me
- PUT /api/me
- GET /api/jobs
- POST /api/jobs
- POST /api/jobs/:jobId/apply
- POST /api/jobs/:jobId/complete
- GET /api/applications
- PUT /api/applications/:applicationId
- GET /api/payments
- POST /api/payments
