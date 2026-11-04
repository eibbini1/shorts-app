# Connect YouTube for scheduled publishing

1. Open https://console.cloud.google.com/ and select or create a project.
2. Enable YouTube Data API v3 in APIs & Services > Library.
3. Configure Google Auth Platform branding and audience. In Testing mode, add the channel owner's Google account as a test user.
4. Create an OAuth client of type Desktop app and download its JSON.
5. Save it at secrets/client_secret.json inside this app. The secrets folder is ignored by Git.
6. Run npm run yt-upload -- --auth from the app folder. Open the printed URL, choose the intended channel, and grant access.
7. Run npm run automate -- --dry-run to preview slots. Run npm run automate to prepare and schedule, or npm run automate:watch to keep processing.

The default publishes one video daily at 20:00 Amman time (UTC+3), at least one hour in the future. Configure publish.hour and publish.utcOffsetHours in automation.json. Use --prepare-only to render without uploading.

The sign-in flow uses a local loopback callback, random state and PKCE. Credentials and refresh tokens stay under secrets/. Permissions cover uploading, reading the connected channel and video status, and adding captions. Google does not offer a captions-only permission; its force-ssl scope also covers other video actions. The app uses it for captions and publication scheduling.

Uploads start private. The worker adds the selected thumbnail and English subtitles before setting publishAt, then checks YouTube's returned status. API projects subject to YouTube's audit restriction may remain private until approval. An accepted upload alone is not proof that scheduled publication is permitted.

storage/automation/uploads.json stores each remote video ID and stage. Attachment failures resume against the same ID. If the upload response is lost, the record becomes uncertain and automatic uploading stops for that episode. Check Studio and reconcile that entry with the existing video ID before retrying; do not simply delete the entry and upload again.

Official setup: https://developers.google.com/youtube/data/guides/auth/installed-apps
Publishing reference: https://developers.google.com/youtube/data/reference/rest/v3/videos#status.publishAt

For automatic Windows sign-in startup, see docs/WINDOWS_WORKER.md. The sign-in task is already installed and running. It will use your connection after the one-time OAuth setup is complete. Google Cloud browser access was declined in this chat, so complete the Cloud-console steps manually.
