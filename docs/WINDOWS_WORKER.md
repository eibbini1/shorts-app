# Run the Shorts worker at Windows sign-in

The sign-in task was installed and verified running on 2 November 2026 after execution permissions changed. The initial CIM restriction is resolved. Both the hidden PowerShell launcher and its Node worker were verified live, including handling a missing YouTube connection without terminating.

To reinstall or update the task from your normal Windows PowerShell session:

    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Acer\OneDrive\Desktop\esam\shorts-app-fixed\shorts-app\scripts\install-worker.ps1" -StartNow

The task is named Billionaire Bites Shorts Worker and runs with your interactive account at sign-in. The worker window is hidden. It runs the queue immediately, then every 15 minutes. The PC must be on and signed in to prepare or upload; already accepted YouTube publication schedules do not require the PC to remain on.

The launcher writes storage\automation\worker-console.log and worker-errors.log, preserves the previous logs at restart, prevents duplicate launchers with a Windows mutex, and can remove a worker lock whose saved owner process is confirmed gone. Direct CLI runs conservatively leave stale locks for inspection. The app's worker lock also prevents overlap with a manually started worker. The launcher assigns Node to a Windows job object, so stopping the scheduled task also terminates the worker and any render subprocesses. This stop/restart behavior was verified against the installed task.

Voice spending remains disabled in automation.json. Drafts are generated separately for review and are never automatically promoted to the production queue. Publication waits for the one-time YouTube connection described in YOUTUBE_SETUP.md.

To run without installing a task:

    npm run automate:watch

To remove the sign-in task:

    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Acer\OneDrive\Desktop\esam\shorts-app-fixed\shorts-app\scripts\uninstall-worker.ps1"

After forcibly stopping a worker, check its PID before removing storage\automation\worker.lock. Preserve storage\automation\uploads.json; it prevents duplicate YouTube uploads.

## Put portrait render intermediates on another drive

Set `SHORTS_RENDER_SCRATCH=D:/Codex-Shorts-render-scratch` in the app's local `.env` and restart the scheduled task when idle. Each output gets its own scratch folder. The app still writes final videos, packs, and worker logs to their configured locations, so keep free space on those drives too. Scratch intermediates remain on disk after rendering.
