# Overview

A script that finds the 4-digit PIN required to view private videos on [watch.livebarn.com](https://watch.livebarn.com).

# Usage

1.  Copy `.env.example` to `.env` (the latter is gitignored).
2.  Fill in `LIVEBARN_BEARER_TOKEN` with the value returned by running the following in the browser console while logged in:
    ```js
    JSON.parse(sessionStorage.getItem('token') || '{}').access_token;
    ```
3.  Set `LIVEBARN_DATE_START` to the start datetime (24h notation). If a game starts at 19:30, set this to 19:31 to avoid fetching the previous game.
4.  Run `npm run start`.
5.  When the correct code is found, the script stops and logs it to the console:

         10/10,000 combinations checked (0.1%)
         Code found: 0013
         Checked 14 codes, written to <OUTPUT_PATH>.json

    You can also check the JSON output file for the code. It will contain every code that was checked, but only the correct code will be marked `true`:

    ```jsonc
    {
      // ...
      "7580": false,
      "7581": false,
      "7582": false,
      "7583": true
    }
    ```
