# Overview
A script that finds the 4-digit PIN required to view private videos on [watch.livebarn.com](https://watch.livebarn.com).

# Usage
1. Copy `.env.example` to `.env` (the latter is gitignored).
2. Fill in `LIVEBARN_BEARER_TOKEN` with the value returned by running the following in the browser console while logged in:
    ```js
    JSON.parse(sessionStorage.getItem('token') || "{}").access_token
    ```
3. Set `LIVEBARN_DATE_START` to the start datetime (24h notation). If a game starts at 19:30, set this to 19:31 to avoid fetching the previous game.
4. Run `npm run start`.