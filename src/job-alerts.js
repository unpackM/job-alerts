import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "jobs-db.json");
const envPath = path.join(rootDir, ".env");
const execFileAsync = promisify(execFile);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const telegramTest = args.has("--telegram-test");
const loop = args.has("--loop");

await loadEnv();

const minScore = Number(process.env.JOB_ALERTS_MIN_SCORE || 60);
const dailySummaryScore = Number(process.env.JOB_ALERTS_DAILY_SUMMARY_SCORE || 50);

if (telegramTest) {
  await sendTelegram("job-alerts Telegram 연결 테스트입니다.");
  console.log("Telegram test message sent.");
  process.exitCode = 0;
}

if (!telegramTest) {
do {
  await runOnce();
  if (!loop) break;
  const base = Number(process.env.JOB_ALERTS_INTERVAL_SECONDS || 10800);
  const jitter = Math.floor(Math.random() * Number(process.env.JOB_ALERTS_JITTER_SECONDS || 600));
  await sleep((base + jitter) * 1000);
} while (true);
}

async function runOnce() {
  const targets = await readJson(path.join(rootDir, "config", "targets.json"));
  const keywords = await readJson(path.join(rootDir, "config", "keywords.json"));
  const db = await readDb();

  const runStartedAt = new Date().toISOString();
  const detectedJobs = [];
  const errors = [];

  for (const target of targets) {
    try {
      const html = await fetchText(target.url);
      const candidates = extractJobCandidates(html, target);
      for (const candidate of candidates) {
        const job = scoreJob(candidate, keywords);
        if (job.score >= dailySummaryScore) {
          detectedJobs.push(job);
        }
      }
    } catch (error) {
      errors.push({
        company: target.company,
        url: target.url,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const newJobs = [];
  for (const job of dedupeJobs(detectedJobs)) {
    if (!db.jobs[job.id]) {
      db.jobs[job.id] = {
        ...job,
        status: "new",
        firstDetectedAt: runStartedAt,
        lastSeenAt: runStartedAt,
        notifiedAt: null
      };
      newJobs.push(db.jobs[job.id]);
    } else {
      db.jobs[job.id].company = job.company;
      db.jobs[job.id].title = job.title;
      db.jobs[job.id].url = job.url;
      db.jobs[job.id].source = job.source;
      db.jobs[job.id].lastSeenAt = runStartedAt;
      db.jobs[job.id].score = job.score;
      db.jobs[job.id].matchedKeywords = job.matchedKeywords;
      db.jobs[job.id].snippet = job.snippet;
    }
  }

  const alertJobs = Object.values(db.jobs)
    .filter((job) => job.lastSeenAt === runStartedAt && !job.notifiedAt)
    .filter((job) => job.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  if (alertJobs.length > 0) {
    const message = formatTelegramMessage(alertJobs, errors);
    if (dryRun) {
      console.log(message);
    } else if (!hasTelegramConfig()) {
      console.log(message);
      console.log("Telegram/GitHub relay config is missing. Set TELEGRAM_* or TELEGRAM_VIA_GITHUB=1 with GH_TOKEN.");
    } else {
      await sendTelegram(message);
      for (const job of alertJobs) {
        db.jobs[job.id].status = "notified";
        db.jobs[job.id].notifiedAt = new Date().toISOString();
      }
    }
  }

  db.runs.unshift({
    startedAt: runStartedAt,
    targets: targets.length,
    detected: detectedJobs.length,
    newJobs: newJobs.length,
    alerted: alertJobs.length,
    errors
  });
  db.runs = db.runs.slice(0, 100);

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    startedAt: runStartedAt,
    targets: targets.length,
    detected: detectedJobs.length,
    newJobs: newJobs.length,
    alerted: alertJobs.length,
    errors: errors.length,
    dbPath
  }, null, 2));
}

async function loadEnv() {
  try {
    const text = await fs.readFile(envPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional for dry runs.
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readDb() {
  try {
    return JSON.parse(await fs.readFile(dbPath, "utf8"));
  } catch {
    return { jobs: {}, runs: [] };
  }
}

async function fetchText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 job-alerts/0.1 (+local personal job monitor)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (fetchError) {
    try {
      const { stdout } = await execFileAsync("curl.exe", [
        "-L",
        "--silent",
        "--show-error",
        "--ssl-no-revoke",
        "--max-time",
        "20",
        "-A",
        "Mozilla/5.0 job-alerts/0.1 (+local personal job monitor)",
        url
      ], {
        maxBuffer: 8 * 1024 * 1024,
        encoding: "utf8",
        windowsHide: true
      });
      if (!stdout || stdout.length < 100) {
        throw new Error("empty curl response");
      }
      return stdout;
    } catch (curlError) {
      const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const curlMessage = curlError instanceof Error ? curlError.message : String(curlError);
      throw new Error(`fetch failed: ${fetchMessage}; curl failed: ${curlMessage}`);
    }
  }
}

function extractJobCandidates(html, target) {
  const cleanText = htmlToText(html);
  const lines = cleanText
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 8 && line.length <= 220);

  const jobPattern = new RegExp([
    "\\ucc44\\uc6a9",
    "\\ubaa8\\uc9d1",
    "\\uacbd\\ub825",
    "Experienced",
    "Career",
    "Business",
    "Manager",
    "PM",
    "\\uc804\\ub7b5",
    "\\uae30\\ud68d",
    "\\uc81c\\ud734",
    "\\ud30c\\ud2b8\\ub108",
    "Growth",
    "\\uba64\\ubc84\\uc2ed",
    "\\uad6c\\ub3c5"
  ].join("|"), "i");

  const jobLike = lines.filter((line) => jobPattern.test(line));

  return jobLike.filter((line) => !isNoiseLine(line)).slice(0, 80).map((line) => {
    const title = guessTitle(line);
    const company = inferCompanyName(title, target);
    if (!company) return null;
    return {
      company,
      source: target.source || target.company,
      url: target.url,
      title,
      snippet: line,
      targetTags: target.tags || [],
      targetTier: target.tier || 3,
      targetFixedCompany: Boolean(target.fixedCompany)
    };
  }).filter(Boolean);
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "\n")
    .replace(/<\/(div|li|p|tr|h1|h2|h3|h4|a|button|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function guessTitle(line) {
  const trimmed = normalizeWhitespace(line);
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function inferCompanyName(title, target) {
  if (target.fixedCompany) return target.fixedCompany;

  const cleanTitle = normalizeWhitespace(title);
  const bracket = cleanTitle.match(/^\[([^\]]{2,40})\]/);
  if (bracket && !isGenericCompanyLabel(bracket[1])) return bracket[1].trim();

  const leadingKeywords = [
    " \uc0ac\uc5c5 \uae30\ud68d",
    " \uc0ac\uc5c5\uae30\ud68d",
    " \uc0c1\ud488 \uae30\ud68d",
    " \uc0c1\ud488\uae30\ud68d",
    " \uc11c\ube44\uc2a4 \uae30\ud68d",
    " \uc11c\ube44\uc2a4\uae30\ud68d",
    " \uc804\ub7b5",
    " Growth",
    " PM",
    " PO",
    " \uc81c\ud734",
    " \ud30c\ud2b8\ub108",
    " \ucf58\ud150\uce20"
  ];
  const keywordIndex = leadingKeywords
    .map((keyword) => cleanTitle.indexOf(keyword))
    .filter((index) => index > 1 && index <= 40)
    .sort((a, b) => a - b)[0];
  if (keywordIndex) {
    const prefix = cleanTitle.slice(0, keywordIndex).replace(/[|&\-·\s]+$/g, "").trim();
    if (prefix.length >= 2 && !isGenericCompanyLabel(prefix)) return prefix;
  }

  const leading = cleanTitle.match(/^([\uac00-\ud7a3A-Za-z0-9&().\-\s]{2,30})\s+(?:\uc0ac\uc5c5|\uc0c1\ud488|\uc11c\ube44\uc2a4|\ube0c\ub79c\ub4dc|Growth|PM|PO|\uc804\ub7b5|\uc81c\ud734|\ud30c\ud2b8\ub108|\ucee4\uba38\uc2a4|\ucf58\ud150\uce20)/i);
  if (leading && !isGenericCompanyLabel(leading[1])) return leading[1].trim();

  const sourceCompany = normalizeSourceCompany(target.company);
  if (isAggregatorSource(sourceCompany)) return "";
  return sourceCompany || target.company;
}

function normalizeSourceCompany(company) {
  return String(company || "")
    .replace(/\s+-\s+(Business Planning|Partnership|Product Planning|Growth|Large Business Strategy)$/i, "")
    .trim();
}

function isGenericCompanyLabel(value) {
  const clean = String(value || "").trim();
  if (/^(NOW|NEW)$/i.test(clean)) return true;
  const genericTerms = [
    "\uacbd\ub825",
    "\uc815\uaddc\uc9c1",
    "\uacc4\uc57d\uc9c1",
    "\uc778\ud134",
    "\uc2e0\uc785",
    "\ucc44\uc6a9",
    "\ubaa8\uc9d1",
    "\uc5c5\uacc4",
    "\uad6d\ub0b4",
    "\ub300\uae30\uc5c5",
    "\uc911\uacac\uae30\uc5c5",
    "\ubcf8\uc0ac"
  ];
  return genericTerms.some((term) => clean.includes(term));
}

function isAggregatorSource(company) {
  return /^(Saramin|Catch|Wanted|Remember)\b/i.test(String(company || "").trim());
}

function scoreJob(candidate, keywordConfig) {
  const haystack = `${candidate.company} ${candidate.title} ${candidate.snippet}`;
  const matchedKeywords = [];
  let score = 0;

  if (candidate.targetTier === 1) score += 25;
  if (candidate.targetTier === 2) score += 15;
  const trustCompanySizeTags = candidate.targetTier <= 2 || candidate.targetFixedCompany;
  if (trustCompanySizeTags && candidate.targetTags.includes("\ub300\uae30\uc5c5")) {
    score += 14;
    matchedKeywords.push("\ub300\uae30\uc5c5");
  }
  if (trustCompanySizeTags && candidate.targetTags.includes("\uc911\uacac\uae30\uc5c5")) {
    score += 8;
    matchedKeywords.push("\uc911\uacac\uae30\uc5c5");
  }
  if (new RegExp("\\uacbd\\ub825|Experienced|Career", "i").test(haystack)) score += 20;
  if (new RegExp("\\uc815\\uaddc|Permanent", "i").test(haystack)) score += 8;

  for (const item of keywordConfig.include) {
    if (containsKeyword(haystack, item.keyword)) {
      score += item.score;
      matchedKeywords.push(item.keyword);
    }
  }

  for (const item of keywordConfig.exclude) {
    if (containsKeyword(haystack, item.keyword)) {
      score += item.score;
      matchedKeywords.push(`-${item.keyword}`);
    }
  }

  return {
    id: stableId(`${candidate.source}|${candidate.title}|${candidate.url}`),
    company: candidate.company,
    title: candidate.title,
    url: candidate.url,
    source: candidate.source,
    score,
    matchedKeywords: [...new Set(matchedKeywords)],
    snippet: candidate.snippet
  };
}

function containsKeyword(text, keyword) {
  if (/^[A-Za-z0-9]{2,3}$/.test(keyword)) {
    return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(keyword)}([^A-Za-z0-9]|$)`, "i").test(text);
  }
  return text.toLocaleLowerCase("ko-KR").includes(keyword.toLocaleLowerCase("ko-KR"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNoiseLine(line) {
  const noisePatterns = [
    /^NAVER Careers?$/i,
    /^Hyundai Motor Company Careers/i,
    /^(\uc0ac\uc5c5\uae30\ud68d|\uc81c\ud734|Growth PM)$/i,
    /\ube45\uc2a4\ube44\uac00 \uc774\uac83\uae4c\uc9c0 \ud55c\ub2e4\uace0/i,
    /(\uac80\uc0c9\uacb0\uacfc|\uac80\uc0c9 \uacb0\uacfc|\ud1b5\ud569\uac80\uc0c9|\ucd1d [0-9,]+\uac74)/i,
    /(\ucc44\uc6a9\ud50c\ub7ab\ud3fc|\uc774\uc9c1|Onboarding|Search|Meta|Next\.js|Webpack)/i,
    /(\uc9c1\ubb34, \ud68c\uc0ac|\ud68c\uc0ac, \uc9c0\uc5ed|\uc5f0\ubd09\uc815\ubcf4|\uc774\ub825\uc11c|\uba74\uc811\uc81c\uc548)/i,
    /Careers?\s*(약관|Privacy|Policy|Login|FAQ)/i,
    /(개인정보|처리방침|Copyright|©|로그인|회원가입|FAQ|Q&A)/i,
    /(게시될 예정|현황을 확인|채용공고 보러가기|지원하러 가기)/i,
    /(\uafc0\ud301|\uc778\ud130\ubdf0|\ube0c\ub79c\ub4dc|\ud06c\ub9ac\uc5d0\uc774\ud130|\ube14\ub85c\uadf8|\uc11c\ub9c9)/i,
    /^(Jobs|Culture|Benefits|Work Space|Login|FAQ|Introduction)$/i,
    /^(Business Development|Corporate Development|Partner Growth Support)$/i
  ];
  return noisePatterns.some((pattern) => pattern.test(line));
}

function dedupeJobs(jobs) {
  const byId = new Map();
  for (const job of jobs) {
    const existing = byId.get(job.id);
    if (!existing || job.score > existing.score) byId.set(job.id, job);
  }
  return [...byId.values()];
}

function stableId(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function formatTelegramMessage(jobs, errors) {
  const lines = [
    `[${u("acbd b825 c9c1 0020 cc44 c6a9 0020 c54c b9bc")}] ${u("c2e0 addc 0020 d6c4 bcf4")} ${jobs.length}${u("ac74")}`,
    ""
  ];

  for (const job of jobs) {
    lines.push(`${job.company} | ${job.title}`);
    if (job.source && job.source !== job.company) lines.push(`Source: ${job.source}`);
    lines.push(`${u("c810 c218")}: ${job.score} / ${u("d0a4 c6cc b4dc")}: ${job.matchedKeywords.slice(0, 8).join(", ") || "-"}`);
    lines.push(job.url);
    if (job.snippet && job.snippet !== job.title) lines.push(`${u("c694 c57d")}: ${job.snippet.slice(0, 160)}`);
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push(`${u("c218 c9d1 0020 c2e4 d328")}: ${errors.length}${u("ac1c 0020 c0ac c774 d2b8")}`);
  }

  return lines.join("\n").slice(0, 3900);
}

function u(hexCodes) {
  return hexCodes.split(/\s+/).map((hex) => String.fromCharCode(Number.parseInt(hex, 16))).join("");
}

function hasTelegramConfig() {
  if (process.env.TELEGRAM_VIA_GITHUB === "1") {
    return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
  }
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function sendTelegram(text) {
  if (process.env.TELEGRAM_VIA_GITHUB === "1") {
    return sendViaGitHub(text);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required. Copy .env.example to .env and fill them.");
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram HTTP ${response.status}: ${body}`);
    }
  } catch (fetchError) {
    try {
      await execFileAsync("curl.exe", [
        "-L",
        "--silent",
        "--show-error",
        "--ssl-no-revoke",
        "--max-time",
        "20",
        "-H",
        "content-type: application/json",
        "-d",
        payload,
        url
      ], {
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        windowsHide: true
      });
    } catch (curlError) {
      const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const curlMessage = curlError instanceof Error ? curlError.message : String(curlError);
      throw new Error(`Telegram send failed: ${fetchMessage}; curl failed: ${curlMessage}`);
    }
  }
}

async function sendViaGitHub(text) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_RELAY_REPO || "unpackM/cgv-telegram-relay";
  const workflow = process.env.GITHUB_RELAY_WORKFLOW || "send-telegram.yml";
  if (!token) {
    throw new Error("GITHUB_TOKEN or GH_TOKEN is required for TELEGRAM_VIA_GITHUB=1.");
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "job-alerts"
    },
    body: JSON.stringify({
      ref: "main",
      inputs: { text }
    })
  });

  if (response.status !== 204) {
    throw new Error(`GitHub relay HTTP ${response.status}: ${await response.text()}`);
  }

  console.log(`[GITHUB RELAY] dispatched ${repo}/${workflow}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
