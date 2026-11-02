# DS CLASSES

Responsive coaching-class web app for Gulab Sir. Students and admins sign in with their registered Indian mobile number and password. Gmail confirmation links are used only for new registrations and secure first-time password setup for existing accounts; the app does not ask users to enter OTP codes. The app also supports batch-specific student content, editable profiles, community posts/comments, a private student-admin inbox, and an admin dashboard for batch, student, learning-material, notice, and live-class management.

## Configure Supabase

1. For a new Supabase project, run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor. For an existing project, first back up the database and review custom RLS policies; do not remove existing users or records. Then run [`supabase/phone-login-rate-limit.sql`](./supabase/phone-login-rate-limit.sql) to add the private, hashed phone-login attempt limiter. It does not change existing profile or class records.
2. In Supabase **Authentication → Sign In / Providers → Email**, enable email authentication and email confirmations. New registrations are confirmed through a Gmail link; routine login and password setup use passwords, not OTP codes. Configure Gmail as Supabase's built-in custom SMTP provider below and keep the **Send Email Hook disabled**; an enabled hook replaces SMTP delivery.
3. In Supabase **Authentication → URL Configuration**, set the Site URL and allow the deployed website URL, local development URL, and `com.dsclasses.app://login-callback` for Android email-confirmation and password-recovery links. Native app links are received by the existing Android `login-callback` deep link.
4. Copy the project's **Project URL** and **publishable/anon key** into [`supabase/config.js`](./supabase/config.js). This browser key is public by design; row-level security protects the data. Never put a `service_role` key in this app.
5. Deploy the password-login function and set the server-side secrets as described in **Phone/password login** below. Never put the service-role key or rate-limit secret in frontend files.
6. New students choose **Naye student? Account banayein**, enter their name, unique 10-digit Indian mobile number, address, Gmail, and password, then open the confirmation link sent to Gmail. Existing passwordless students choose **Purana account? Password set karein**, request a secure password-recovery link at their registered Gmail, open it, and set their mobile/password. Thereafter they use mobile + password. Passwords are handled by Supabase Auth and are never stored in the profiles table.
7. Admin login does not create accounts. Ensure the admin already exists under Supabase **Authentication → Users**, then promote the exact email with [`supabase/promote-admin.sql`](./supabase/promote-admin.sql). An admin's first password setup requires the registered Gmail's secure recovery link; future login uses admin mobile + password. The login Edge Function and app both require `app_metadata.role = 'admin'`. The JWT's top-level `role = 'authenticated'` is not the admin claim. If the admin does not yet have an Auth account, create/invite it in Supabase before promotion.
8. Create batches and assign students. In the app, admins use the same Home, Classes, Notes, Community, Inbox, and Profile navigation as students; open **Profile → Admin Dashboard** for management. Batch “Delete” archives a batch so its existing learning data is retained. Student account deletion is permanent and requires confirmation.

## Phone/password login

The public `phone-password-login` Edge Function looks up the submitted mobile number using the server-only Supabase service-role key, then asks Supabase Auth to verify the password against that account's email. It returns an Auth session only after password verification; admin requests additionally require `app_metadata.role = 'admin'`. Login failures are intentionally generic to avoid revealing whether a phone number is registered. Indian mobile numbers may be entered with or without the `+91` prefix. Each phone number must belong to exactly one profile; ambiguous duplicate phone values are rejected until an admin corrects them.

1. Deploy [`supabase/functions/phone-password-login/index.ts`](./supabase/functions/phone-password-login/index.ts): `supabase functions deploy phone-password-login --project-ref <project-ref>`. The function uses Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` server environment variables. Never copy the service-role key into the website/app.
2. Set `PHONE_LOGIN_RATE_LIMIT_SECRET` as a Supabase Edge Function secret to a randomly generated, private value. The database limiter stores only an HMAC of a phone number; it blocks after five failed attempts for 15 minutes. Keep this secret out of the app and Git.
3. Configure Supabase built-in SMTP as described below and leave the Send Email Hook disabled. Keep email confirmations enabled so new accounts cannot skip Gmail verification.
4. Existing passwordless users must finish the one-time Gmail password-recovery setup before mobile login works. Test student and admin accounts independently after deploying this function and applying the SQL limiter. No account or profile data is deleted by this migration.

## Gmail SMTP with Supabase Auth

Use Supabase's built-in Auth email delivery for Gmail SMTP. **Do not enable the Send Email Hook** in this mode: while enabled, Supabase bypasses its built-in SMTP. The optional [`send-email` Edge Function](./supabase/functions/send-email/index.ts) is for API-based providers such as Resend, not Gmail SMTP.

1. In Supabase **Project Settings → Authentication → SMTP Settings**, enable custom SMTP and use Gmail's SMTP host `smtp.gmail.com`, port `465` (SSL) or `587` (STARTTLS), and your full Gmail address as the SMTP username. Use a Google **App Password** as the SMTP password; do not use your normal Google password. Google 2-Step Verification must be enabled to create an App Password. Set the sender email to that Gmail address and choose a recognizable sender name. Put the App Password only in the Supabase dashboard.
2. In **Authentication → Sign In / Providers → Email**, keep email authentication and confirmations enabled. Set the signup confirmation and password recovery email templates to include `{{ .ConfirmationURL }}` so Gmail opens a verification/recovery link; do not use `{{ .Token }}` templates for this app's link-only flows.
3. In **Authentication → Hooks**, ensure **Send Email** is disabled. Save the settings, test a new signup and an existing-account recovery using a test account, and open the email links on the device where the app is installed. Admin first-time setup still requires an existing admin account with `app_metadata.role = 'admin'`.
4. Configure Supabase email rate limits/CAPTCHA for the expected traffic. Gmail may impose sending limits and is not intended for high-volume transactional delivery; if Gmail delivery is restricted, use a transactional provider such as Resend with the Send Email Hook instead.

The SQL creates private storage buckets for avatars, community photos, and PDF notes; rerunning it also forces these three bucket IDs to stay private and refreshes their size/type limits. Row-level-security policies protect student data and files. Image paths in community posts and profile avatars are checked against the owning student's storage folder; students can only share their own uploaded files with their batch. Community/avatar signed links expire after five minutes. The email, phone number, and address are visible only to the student and an authorized admin. Community posts expose only the author's display name and profile photo. Admin student lists obtain email verification status through a role-checked database function; no service-role key belongs in this app.

Students can read learning materials, notices, and classes only when the content is assigned to their current batch. Existing rows with a null `batch_id` are preserved by the schema but are not shown to students; assign them to a batch before relying on them.

If this project already has additional custom policies on `storage.objects`, review them before applying the schema: Supabase permissive policies combine with OR semantics, so another broad `SELECT` policy can still expose private objects. Making a bucket private also does not revoke signed URLs that were already issued; those links remain usable until their expiry.

The profile schema keeps email, phone, and address private and includes an idempotent `ALTER TABLE` so `profiles.email` may be null on both fresh and existing projects.

## Android APK with Capacitor

The Android wrapper packages the existing HTML/CSS/JS app in Capacitor's local WebView; `capacitor.config.json` intentionally has no remote `server.url`, and Android uses the no-action-bar native theme. Install Node.js 22+ and JDK 21, and ensure Android SDK Platform 36 and Build Tools are available. From this project folder in PowerShell:

```powershell
npm install
npm run android:add
npm run android:apk
```

The debug APK output is `android\app\build\outputs\apk\debug\app-debug.apk`. App name: **DS CLASSES**; application ID: `com.dsclasses.app`. Students and admins use mobile/password after one-time Gmail link confirmation; configure the phone-login function and SQL limiter, enable email confirmations, allow the `com.dsclasses.app://login-callback` redirect, configure built-in Gmail SMTP, and disable the Send Email Hook before testing. No OTP code is used. PDF links and external live-class provider links can also open an external browser/viewer and show its controls; this does not mean the app shell is running as a website.

## Live video

This app does not provide a video-streaming service. Create a room with a video provider, then paste its student-facing **HTTPS viewer link** into the admin live-class form. Do not paste provider secrets, stream keys, or admin/control links there. Add a recording HTTPS link after the class ends. Students can join from Classes and send comments; comments update in real time when Supabase Realtime is enabled for `live_chat` by the schema.

## Publish with GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys the app, [`privacy.html`](./privacy.html), [`terms.html`](./terms.html), and public Supabase client config when pushed to `main` or `master`. This workspace currently has no Git repository or remote configured, so a live homepage URL and deployment status cannot be verified here.

To deploy with HTTPS, create a GitHub repository, push this project to its `main` or `master` branch, and enable **Settings → Pages → Build and deployment → GitHub Actions**. GitHub Pages will provide the deployed HTTPS address after the workflow succeeds; use that actual address, not an assumed URL. The public policy pages will be at that homepage's `/privacy.html` and `/terms.html` paths. Before publishing, replace the contact-email placeholders in both policy pages with a monitored address and review the policies for your actual operating and legal requirements.

Google OAuth is not used by the current login flow. The website is public; never add a Supabase service-role key, phone-login rate-limit secret, or other secrets to published files.

## Local preview and production

Run `npm run build` to prepare the web assets in `www/`, then serve that folder over HTTP for Supabase authentication. Phone/password login requires the deployed Edge Function and database rate-limit migration; signup and first-time password setup require working Gmail confirmation/recovery links. OTP code entry is not part of the app flow. Only the public project URL/key belong in frontend configuration.
