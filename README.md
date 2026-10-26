# DS CLASSES

Responsive coaching-class web app for Gulab Sir. The frontend supports Google Sign-In through Supabase, student profiles, batch-specific notices and PDF notes, private student information, batch community posts/photos, live-class links and comments, and an admin dashboard for batches, student assignments, notices, notes, and live sessions.

## Configure Supabase

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) once in its SQL Editor.
2. In Google Cloud Console, create a **Web application OAuth client**. Add `https://dhqklwipvekpgfhcvhes.supabase.co/auth/v1/callback` as its authorized redirect URI. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter this Web client ID and its client secret. The Supabase Web client credentials are used for both web and Android sign-in because Android currently completes OAuth in the system browser through Supabase. Never place the Web client secret in this app.
3. Optionally create a separate **Android OAuth client** using package `com.dsclasses.app` and the debug signing SHA-1 `82:AB:1D:F5:E8:92:4A:78:84:0B:B2:38:14:40:CF:3F:C9:03:16:3F`. The Android client ID is not used by this browser-based Supabase OAuth flow; do not paste it into Supabase's Google Web client ID field or the frontend. A release-signed APK will have a different SHA-1 if it uses a different signing certificate.
4. In Supabase **Authentication → URL Configuration**, set the Site URL and add every exact web URL (for example `http://localhost:8000/` for local development) plus `com.dsclasses.app://login-callback/` to the allowed redirect URLs. Configure the Google OAuth consent screen and publish/add test users as required by Google's settings. Do not open the website using a `file://` URL; browser Google Sign-In requires HTTP/HTTPS.
5. Copy the project's **Project URL** and **publishable/anon key** into [`supabase/config.js`](./supabase/config.js). This browser key is public by design; row-level security protects the data. Never put a `service_role` key in this app.
6. Students sign in or register with Google. New students can enter their name, phone, and address before signing in; Google creates the Supabase account and the existing database trigger creates the profile.
7. Promote the admin's Google account only after its first Google sign-in. Replace the email in [`supabase/promote-admin.sql`](./supabase/promote-admin.sql), run the SQL once, then sign in again via **Gulab Sir / Admin login**. Admin access remains enforced by server-managed `app_metadata.role = 'admin'` and existing RLS policies; Google identity alone does not grant admin access.
8. Create batches and assign students. Existing notices, notes, profiles, community, live classes, and admin features continue to use the existing Supabase database and policies.

The SQL creates private storage buckets for avatars, community photos, and PDF notes; rerunning it also forces these three bucket IDs to stay private and refreshes their size/type limits. Row-level-security policies protect student data and files. Image paths in community posts and profile avatars are checked against the owning student's storage folder; students can only share their own uploaded files with their batch. Community/avatar signed links expire after five minutes. The email, phone number, and address are visible only to the student and an authorized admin. Community posts expose only the author's display name and profile photo.

If this project already has additional custom policies on `storage.objects`, review them before applying the schema: Supabase permissive policies combine with OR semantics, so another broad `SELECT` policy can still expose private objects. Making a bucket private also does not revoke signed URLs that were already issued; those links remain usable until their expiry.

The profile schema keeps email, phone, and address private and includes an idempotent `ALTER TABLE` so `profiles.email` may be null on both fresh and existing projects.

## Android APK with Capacitor

The Android wrapper packages the existing HTML/CSS/JS app without changing its database schema or RLS policies. Install Node.js 22+ and JDK 21, and ensure Android SDK Platform 36 and Build Tools are available. From this project folder in PowerShell:

```powershell
npm install
npm run android:add
npm run android:apk
```

The debug APK output is `android\app\build\outputs\apk\debug\app-debug.apk`. App name: **DS CLASSES**; application ID: `com.dsclasses.app`. Android Google Sign-In opens the system browser and returns through `com.dsclasses.app://login-callback/`; allow that exact redirect in Supabase Auth before testing.

## Live video

This app does not provide a video-streaming service. Create a room with a video provider, then paste its student-facing **HTTPS viewer link** into the admin live-class form. Do not paste provider secrets, stream keys, or admin/control links there. Add a recording HTTPS link after the class ends. Students can join from Classes and send comments; comments update in real time when Supabase Realtime is enabled for `live_chat` by the schema.

## Publish with GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys the app, [`privacy.html`](./privacy.html), [`terms.html`](./terms.html), and public Supabase client config when pushed to `main` or `master`. This workspace currently has no Git repository or remote configured, so a live homepage URL and deployment status cannot be verified here.

To deploy with HTTPS, create a GitHub repository, push this project to its `main` or `master` branch, and enable **Settings → Pages → Build and deployment → GitHub Actions**. GitHub Pages will provide the deployed HTTPS address after the workflow succeeds; use that actual address, not an assumed URL. The public policy pages will be at that homepage's `/privacy.html` and `/terms.html` paths. Before publishing, replace the contact-email placeholders in both policy pages with a monitored address and review the policies for your actual operating and legal requirements.

In Google Auth/consent-screen settings, use the deployed homepage and its privacy-policy page from the successful deployment. Add the deployed app URL to Supabase Auth's allowed redirect URLs. The website is public; never add a Supabase service-role key or other secrets to published files.

## Local preview and production

Run `npm run build` to prepare the web assets in `www/`, then serve that folder over HTTP for Supabase OAuth redirects. Google Sign-In and all student/admin data require the configured Supabase project. No backend credentials are required in chat or in the frontend other than the public project URL/key.
