# Production deployment

Sonora uses two services:

1. Render runs the private conversion worker.
2. Vercel runs the Next.js PWA and issues signed worker URLs.

No database is needed for music. Songs remain on each user's device.

## Before deploying

1. Revoke any Vercel or Render token that was pasted into chat, logs, or screenshots.
2. Put the project in a private GitHub repository.
3. Generate one shared downloader secret:

   ```bash
   openssl rand -base64 48
   ```

4. Keep that value private. Configure it as `DOWNLOADER_API_KEY` on both services.

## 1. Deploy the Render worker

1. In Render, create a new Blueprint from the GitHub repository.
2. Render reads `render.yaml` and builds `Dockerfile`.
3. Enter:
   - `DOWNLOADER_API_KEY`: the shared secret.
   - `ALLOWED_ORIGINS`: the expected production app origin. It can be corrected after Vercel assigns the final URL.
   - `YT_DLP_PROXY`: optional trusted proxy URL if YouTube challenges Render's outbound IP.
   - `YT_DLP_COOKIES_PATH`: optional `/etc/secrets/youtube-cookies.txt` when using a Render secret file instead.
4. Use at least the Starter/always-on plan for dependable downloads.
5. Wait for `/health` to return JSON with `"ok": true`.
6. Copy the worker URL, such as `https://sonora-downloader.onrender.com`.

The worker does not need a persistent disk. It deletes temporary media after streaming it.

If downloads report that YouTube is blocking the server, configure either `YT_DLP_PROXY` or a `youtube-cookies.txt` Render secret file. Never commit proxy credentials or YouTube cookies to Git.

## 2. Deploy the Vercel app

Import the same GitHub repository into Vercel and set:

```text
DOWNLOADER_URL=https://your-render-service.onrender.com
DOWNLOADER_API_KEY=the-same-shared-secret
NEXT_PUBLIC_YOUTUBE_ENABLED=true
YOUTUBE_REGION=US
NEXT_PUBLIC_YOUTUBE_REGION=US
```

Optional:

```text
YOUTUBE_API_KEY=server-only-youtube-data-api-key
NEXT_PUBLIC_JAMENDO_CLIENT_ID=jamendo-client-id
```

Deploy the production branch. Vercel should use:

```text
Build command: npm run build
Install command: npm ci
Framework: Next.js
Node.js: 22
```

## 3. Finalize CORS

In Render, set `ALLOWED_ORIGINS` to every exact app origin that should be allowed:

```text
https://your-project.vercel.app,https://music.yourdomain.com
```

Do not add paths or trailing slashes. Restart/redeploy the Render service after changing this value.

Preview Vercel URLs are intentionally not allowed unless their exact origins are added. Production downloads should use the stable production or custom domain.

## 4. Production acceptance test

On a real phone:

1. Open the production URL over HTTPS.
2. Install Sonora to the home screen.
3. Search for a video you are authorized to download.
4. Tap **Download** directly on the Explorer result.
5. Select MP3, keep the recovery-copy option enabled, and complete the rights confirmation.
6. Confirm the track appears in Library and can be added to a playlist.
7. Confirm the audio file also appears in Downloads/Files.
8. Turn on airplane mode, fully close Sonora, reopen it, and play the track.
9. Restart the phone and repeat the offline playback test.

## Safe deployment access

Do not paste API tokens into chat. Prefer connecting the private GitHub repository through the Vercel and Render dashboards.

If command-line deployment is required, create fresh short-lived tokens and place them only in a local ignored file named `.deploy.env`. Never commit that file, and revoke the tokens after deployment.
