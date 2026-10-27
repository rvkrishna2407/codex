# CodeX

CodeX is a coding-contest app with an Express API, PostgreSQL/Prisma storage, and a React frontend.

## Run locally

1. Install the workspace dependencies with `bun install`.
2. Keep the existing `packages/db/.env` and set its `DATABASE_URL` to your PostgreSQL database. The required variable is listed in `packages/db/.env.example`.
3. Configure the backend variables in `apps/backend/.env`. The complete key list is in `apps/backend/.env.example`; retain your existing JWT secrets and copy in the missing settings. Add the administrator email(s) to `ADMIN_EMAILS`, separated by commas.
4. Configure `apps/frontend/.env` from `apps/frontend/.env.example` if the API is not running at `http://localhost:4000`.
5. Apply database changes and generate Prisma Client:

   ```sh
   bun run --filter db migrate:dev
   ```

6. Start the frontend and backend from the repository root:

   ```sh
   bun run dev
   ```

   Open `http://localhost:5173`. In development, request a sign-in link from the app and click **Open sign-in link** in the sign-in dialog; the app sends its URL token to the backend for verification. Add an OpenAI-compatible API key, base URL, and model to `apps/backend/.env` to enable AI grading. Set `POSTMARK_SERVER_TOKEN` and a verified `FROM_EMAIL` to send sign-in emails through Postmark in production.

## Features

- Email magic-link authentication, with administrator access restricted to `ADMIN_EMAILS`.
- Admin contest publishing with scheduled start/end times and multiple challenges.
- Contest and challenge browsing, solution submissions, AI feedback, and a leaderboard that refreshes every 15 seconds.
- A dark, responsive interface with no password or external code-execution service.

The grader evaluates submitted text using an OpenAI-compatible chat-completions endpoint; it does not execute untrusted code. Required secrets belong only in the ignored `.env` files should never be committed.
