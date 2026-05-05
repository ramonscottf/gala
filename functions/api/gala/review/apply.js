// /api/gala/review/apply
// Takes a sendId, pulls its override from D1 marketing_edits, surgically rewrites
// the matching block in functions/api/gala/marketing-test.js on the main branch,
// commits via GitHub API, marks the row 'applied' with the commit SHA.

import { jsonError, jsonOk } from '../_auth.js';
import { verifyReviewSession } from './_session.js';

const REPO_OWNER = 'ramonscottf';
const REPO_NAME = 'def-site';
const FILE_PATH = 'functions/api/gala/marketing-test.js';

async function ghHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'def-site-review-bot',
    'Content-Type': 'application/json',
  };
}

async function ghGetFile(token, branch = 'main') {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${branch}`;
  const r = await fetch(url, { headers: await ghHeaders(token) });
  if (!r.ok) throw new Error(`GitHub GET file: ${r.status} ${await r.text()}`);
  const data = await r.json();
  // content is base64 of UTF-8 bytes. atob() returns a binary string; we must
  // convert that back through TextDecoder to get proper UTF-8 (otherwise
  // multi-byte chars like emoji and em-dash come back mangled).
  const binStr = atob(data.content.replace(/\n/g, ''));
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  const decoded = new TextDecoder('utf-8').decode(bytes);
  return { sha: data.sha, content: decoded };
}

async function ghPutFile(token, branch, sha, newContent, commitMessage, author) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  // Encode UTF-8 → base64. Build a binary string in chunks to avoid call-stack
  // overflow from spreading a large Uint8Array, then btoa(). This is the
  // canonical Workers-safe pattern — using `String.fromCharCode(...arr)` will
  // overflow on large arrays AND mishandle multi-byte chars in non-trivial cases.
  const utf8 = new TextEncoder().encode(newContent);
  let binStr = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < utf8.length; i += CHUNK) {
    binStr += String.fromCharCode.apply(null, utf8.subarray(i, i + CHUNK));
  }
  const b64 = btoa(binStr);
  const body = {
    message: commitMessage,
    content: b64,
    sha: sha,
    branch: branch,
    committer: {
      name: author.name || 'DEF Gala Review',
      email: author.email || 'gala@daviskids.org',
    },
  };
  const r = await fetch(url, {
    method: 'PUT',
    headers: await ghHeaders(token),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub PUT file: ${r.status} ${await r.text()}`);
  return await r.json();
}

// Regex matchers for the SENDS object entries in marketing-test.js
// Match a multi-line entry: `  sId: { ... },` where the body uses backticks
function findEmailEntry(source, sendId) {
  // Match: `  s12: {\n    type: 'email',\n    subject: '...',\n    body: `...multi-line...`,\n  },`
  // Subject can use single OR double quotes. Use a non-greedy match for the
  // subject body that allows the *other* quote char (and escaped same-char)
  // inside. We try double-quoted first, then single-quoted.
  const reDouble = new RegExp(
    `(  ${sendId}:\\s*\\{\\s*\\n\\s*type:\\s*'email',\\s*\\n\\s*subject:\\s*)"((?:[^"\\\\]|\\\\.)*)",([^]*?)body:\\s*\`([^]*?)\`,\\s*\\n\\s*\\},`,
    'm'
  );
  const reSingle = new RegExp(
    `(  ${sendId}:\\s*\\{\\s*\\n\\s*type:\\s*'email',\\s*\\n\\s*subject:\\s*)'((?:[^'\\\\]|\\\\.)*)',([^]*?)body:\\s*\`([^]*?)\`,\\s*\\n\\s*\\},`,
    'm'
  );
  let m = source.match(reDouble);
  let quote = '"';
  if (!m) { m = source.match(reSingle); quote = "'"; }
  if (!m) return null;
  // Unescape the captured subject (turn \" into ", \\ into \)
  const rawSubject = m[2];
  const subject = quote === '"'
    ? rawSubject.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    : rawSubject.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  return {
    full: m[0],
    prefix: m[1],
    quoteChar: quote,
    subject: subject,
    middle: m[3],
    body: m[4],
    index: m.index,
  };
}

function findSmsEntry(source, sendId) {
  // Single-line: `  sms1: { type: 'sms', body: '...' + PORTAL_LINK },`
  // The body is a JS expression. Capture everything from `body:` up to the
  // closing ` },` at end of line. Anchor with `\n` to make sure we stay on
  // a single logical entry.
  const re = new RegExp(
    `(\\n  ${sendId}:\\s*\\{\\s*type:\\s*'sms',\\s*body:\\s*)([^\\n]*?)(\\s*\\},(?=\\n))`,
    'm'
  );
  const m = source.match(re);
  if (!m) return null;
  return {
    // Note: m[0] starts with \n (which is part of (\\n  ...) capture)
    full: m[0],
    prefix: m[1],
    bodyExpr: m[2],
    suffix: m[3],
    // Keep the leading \n in `index` so replacement doesn't lose it
    index: m.index,
  };
}

// Build a JS template-literal-safe body string. We escape backticks and ${
// because Sherry's edited HTML may contain ${ in inline styles like `${...}`
function escapeForTemplateLiteral(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

// Build a JS single-quoted string for SMS bodies
function escapeForSingleQuoted(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.GALA_DB) return jsonError('DB not configured', 503);
  if (!env.GITHUB_PAT) return jsonError('GITHUB_PAT not configured', 503);

  // Auth gate
  const session = await verifyReviewSession(request, env.GALA_REVIEW_SECRET);
  if (!session) return jsonError('Not signed in', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  // Editor email always comes from the verified session, not the request body
  body.appliedBy = session.email;

  const { sendId, applyAll } = body;

  // Determine which sends to apply
  let sendIds = [];
  if (applyAll) {
    const { results } = await env.GALA_DB.prepare(
      `SELECT send_id FROM marketing_edits WHERE (subject_override IS NOT NULL OR body_override IS NOT NULL) AND status != 'applied'`
    ).all();
    sendIds = results.map(r => r.send_id);
  } else if (sendId) {
    sendIds = [sendId];
  } else {
    return jsonError('sendId or applyAll required', 400);
  }

  if (sendIds.length === 0) {
    return jsonOk({ ok: true, applied: 0, message: 'No pending edits to apply' });
  }

  // Pull current file from main
  let file;
  try {
    file = await ghGetFile(env.GITHUB_PAT, 'main');
  } catch (e) {
    return jsonError(`Failed to read file from GitHub: ${e.message}`, 502);
  }

  let updatedSource = file.content;
  const applied = [];
  const failed = [];
  const summaries = [];

  for (const sid of sendIds) {
    // Read override from D1
    const row = await env.GALA_DB.prepare(
      `SELECT subject_override, body_override FROM marketing_edits WHERE send_id = ?`
    ).bind(sid).first();

    if (!row || (!row.subject_override && !row.body_override)) {
      failed.push({ sendId: sid, error: 'No override stored' });
      continue;
    }

    // Detect type by what we find in source
    const emailEntry = findEmailEntry(updatedSource, sid);
    const smsEntry = !emailEntry ? findSmsEntry(updatedSource, sid) : null;

    if (!emailEntry && !smsEntry) {
      failed.push({ sendId: sid, error: 'Could not locate entry in source' });
      continue;
    }

    if (emailEntry) {
      const newSubject = row.subject_override !== null ? row.subject_override : emailEntry.subject;
      const newBody = row.body_override !== null ? row.body_override : emailEntry.body;

      // Re-quote the subject. Prefer double quotes if the subject contains
      // a single quote / apostrophe and no double quotes; otherwise fall back
      // to single-quoted with apostrophe escaped.
      let subjectQuoted;
      if (newSubject.includes("'") && !newSubject.includes('"')) {
        subjectQuoted = '"' + newSubject.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      } else {
        subjectQuoted = "'" + newSubject.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
      }
      const bodyEscaped = escapeForTemplateLiteral(newBody);

      // emailEntry.prefix ends with `subject: ` (with trailing space). Just
      // append the quoted subject + comma + middle + new body block.
      const replacement =
        emailEntry.prefix +
        subjectQuoted + ',' +
        emailEntry.middle +
        'body: `' + bodyEscaped + '`,\n  },';

      updatedSource = updatedSource.slice(0, emailEntry.index) +
        replacement +
        updatedSource.slice(emailEntry.index + emailEntry.full.length);

      applied.push(sid);
      summaries.push({
        sendId: sid,
        type: 'email',
        subjectChanged: row.subject_override !== null,
        bodyChanged: row.body_override !== null,
      });
    } else if (smsEntry) {
      // For SMS, we always replace as a quoted string (lose any `+ CONST` concat)
      const newBody = row.body_override !== null ? row.body_override : '';
      const escapedBody = "'" + escapeForSingleQuoted(newBody) + "'";

      const replacement = smsEntry.prefix + escapedBody + smsEntry.suffix;
      updatedSource = updatedSource.slice(0, smsEntry.index) +
        replacement +
        updatedSource.slice(smsEntry.index + smsEntry.full.length);

      applied.push(sid);
      summaries.push({
        sendId: sid,
        type: 'sms',
        bodyChanged: true,
      });
    }
  }

  if (applied.length === 0) {
    return jsonOk({ ok: false, applied: 0, failed, message: 'No edits could be applied' });
  }

  // Commit
  const commitMsg = `Apply ${applied.length} marketing edit${applied.length === 1 ? '' : 's'}: ${applied.join(', ')}\n\nApplied via /gala-review/ by ${body.appliedBy || 'review-tool'}`;

  let commitResult;
  try {
    commitResult = await ghPutFile(
      env.GITHUB_PAT,
      'main',
      file.sha,
      updatedSource,
      commitMsg,
      { name: body.appliedBy || 'DEF Gala Review', email: 'gala@daviskids.org' }
    );
  } catch (e) {
    return jsonError(`GitHub commit failed: ${e.message}`, 502);
  }

  const commitSha = commitResult.commit.sha;

  // Mark applied in D1
  for (const sid of applied) {
    await env.GALA_DB.prepare(
      `UPDATE marketing_edits SET status = 'applied', applied_at = CURRENT_TIMESTAMP, applied_commit = ? WHERE send_id = ?`
    ).bind(commitSha, sid).run();
  }

  return jsonOk({
    ok: true,
    applied: applied.length,
    sendIds: applied,
    failed: failed,
    commit: {
      sha: commitSha,
      url: commitResult.commit.html_url,
      message: commitMsg.split('\n')[0],
    },
    summaries,
  });
}
