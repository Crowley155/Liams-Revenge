import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { simpleParser } from 'mailparser';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCES = join(ROOT, 'sources');
const DATA_FILE = join(ROOT, 'data', 'case-data.json');

const EML_TO_THREAD = {
  'Formal Grievance_ Safety Incident_Battery regarding Liam Crowley (Mize Elementary).eml': {
    id: 'thread-formal-grievance',
    title: 'Formal Grievance — Safety Incident / Battery at Mize Elementary',
    docIds: ['DOC-003', 'DOC-004', 'DOC-005', 'DOC-006', 'DOC-007', 'DOC-008', 'DOC-011'],
    abstract: 'Parent escalates from safety concerns to formal grievance citing USD 232 policy, K.S.A. 72-6114, and Lease §8(d). Principal deflects to JCPRD as "separate entity." Alvie Cater proposes meeting, then cancels it within 48 hours.'
  },
  'Incident at JCPRD.eml': {
    id: 'thread-incident-jcprd',
    title: 'Initial JCPRD Incident Response',
    docIds: ['DOC-009', 'DOC-010', 'DOC-011'],
    abstract: 'JCPRD site coordinator Leigh White responds with "I am sorry you feel [child] is being harmed" framing. Parent rejects minimization, announces DCF filing, police report, and JCCL complaint.'
  },
  'JCPRD at Mize Elementary.eml': {
    id: 'thread-jcprd-at-mize',
    title: 'JCPRD Independence vs. Lease §8(d)',
    docIds: ['DOC-012', 'DOC-013', 'DOC-014'],
    abstract: 'Alvie Cater asserts JCPRD operates independently and uses parent\'s "exclusively aftercare" language as jurisdictional anchor. Parent fires back with Lease §8(d). Cater cancels scheduled meeting.'
  },
  'JCPRD Incident Report.eml': {
    id: 'thread-incident-report',
    title: 'JCPRD Incident Report Dispute',
    docIds: ['DOC-015', 'DOC-016', 'DOC-017', 'DOC-018', 'DOC-019', 'DOC-020', 'DOC-021'],
    abstract: 'JCPRD sends incident form. Parent delivers detailed rebuttal: witness list vs. narrative, "no medical treatment" vs. pediatric escalation, accidental vs. intentional. Parent closes administrative channel and attaches lease.'
  },
  'Liam Crowley Absence 4_6 thru 4_10 (1).eml': {
    id: 'thread-absence',
    title: 'Absence Notification & 504 / Counseling Thread',
    docIds: ['DOC-001', 'DOC-002', 'DOC-022', 'DOC-023', 'DOC-024', 'DOC-025', 'DOC-026', 'DOC-027'],
    abstract: 'Parent notifies school of absence, DCF, and police case. Thread evolves into 504 routing, counselor Janine Winters phone call, and memorialized "not the avenue" email. Parent declines school counseling, discloses pending litigation.'
  },
  'This morning.eml': {
    id: 'thread-this-morning-2025',
    title: 'Fall 2025 — Recess / JCPRD account vs. written policy ("This morning")',
    docIds: ['DOC-028', 'DOC-029'],
    abstract: 'USD 232 kindergarten staff email states no age mixing at recess and 3–4 adult supervisors. Parent replies that Liam\'s detailed account should not have been possible under that policy, links same older students to JCPRD concerns, and asks whether policy is always enforced. Following day, parent emails that Liam called incidents \'pranks,\' frames developmental distinction (imagination vs. dishonesty), thanks Leigh White for help, and commits to consequences—while the thread preserves parent\'s contemporaneous view that fabrication was hard to square with consistency and detail.'
  }
};

const SOURCE_URLS = {
  'AUTH-01': 'https://ksrevisor.gov/statutes/chapters/ch72/072_061_0014.html',
  'AUTH-02': 'https://ksrevisor.gov/statutes/chapters/ch72/072_061_0047.html',
  'AUTH-03': 'https://ksrevisor.gov/statutes/chapters/ch75/075_061_0004.html',
  'AUTH-04': null,
  'AUTH-05': 'https://ksrevisor.gov/statutes/chapters/ch45/045_002_0015.html',
  'AUTH-06': 'https://ksrevisor.gov/statutes/chapters/ch45/045_002_0017.html',
  'AUTH-07': 'https://ksrevisor.gov/statutes/chapters/ch45/045_002_0018.html',
  'AUTH-08': 'https://www.law.cornell.edu/regulations/kansas/K-A-R-28-4-420',
  'AUTH-09': 'https://www.law.cornell.edu/regulations/kansas/K-A-R-28-4-115a',
  'AUTH-10': 'https://www.law.cornell.edu/regulations/kansas/K-A-R-28-4-114',
  'AUTH-11': 'https://www.law.cornell.edu/regulations/kansas/K-A-R-28-4-133',
  'AUTH-12': null,
  'AUTH-13': 'https://www.justia.com/cases/kansas/supreme-court/1993/67-476-2.html',
  'AUTH-14': null, 'AUTH-15': null, 'AUTH-16': null, 'AUTH-17': null,
  'AUTH-18': null, 'AUTH-19': null, 'AUTH-20': null, 'AUTH-21': null,
  'AUTH-22': null, 'AUTH-23': null, 'AUTH-24': null, 'AUTH-25': null,
  'AUTH-26': null, 'AUTH-27': null, 'AUTH-28': null, 'AUTH-29': null,
  'AUTH-30': null, 'AUTH-31': null, 'AUTH-32': null, 'AUTH-33': null,
  'AUTH-34': 'https://www.justia.com/cases/kansas/supreme-court/1997/76-875-2.html',
  'AUTH-35': null, 'AUTH-36': null, 'AUTH-37': null,
  'AUTH-38': 'https://www.justia.com/cases/kansas/supreme-court/2008/97-186-2.html',
  'AUTH-39': 'https://www.justia.com/cases/illinois/court-of-appeals-first-appellate-district/2014/1-13-2987.html',
  'AUTH-40': null,
  'AUTH-41': 'https://www.jcprd.com/2075/Olathe-Program-Handbook',
  'AUTH-42': null,
  'AUTH-43': 'https://usd232.diligent.community/document/4c7ee92c-6017-426b-8fea-c87c2e2dc16f/'
};

// ─── Email → actor mapping ───────────────────────────────────────────────
const EMAIL_TO_ACTOR = {
  'william.crowley@gmail.com': 'will-crowley',
  'gbalthazor@usd232.org': 'gerri-balthazor',
  'acater@usd232.org': 'alvie-cater',
  'janine.winters@usd232.org': 'janine-winters',
  'leigh.white@jocogov.org': 'leigh-white',
  'jennifer.anderson@jocogov.org': 'jennifer-anderson',
  'amy.branson@jocogov.org': 'amy-branson',
  'bburks@usd232.org': 'breanna-burks',
};

function actorFromEmail(email) {
  if (!email) return null;
  return EMAIL_TO_ACTOR[email.toLowerCase()] || null;
}

function actorFromName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const [, actorId] of Object.entries(EMAIL_TO_ACTOR)) {
    const parts = actorId.split('-');
    if (parts.every(p => lower.includes(p))) return actorId;
  }
  return null;
}

// ─── Parse "On [date] [person] <email> wrote:" attribution lines ─────────
// These often span 2+ lines in plain text, e.g.:
//   On Thu, Apr 9, 2026 at 3:48 PM Janine Winters <janine.winters@usd232.org>
//   wrote:
function parseAttribution(attrText) {
  if (!attrText) return null;
  const clean = attrText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  const emailMatch = clean.match(/<([^>]+@[^>]+)>/);
  const email = emailMatch ? emailMatch[1].trim() : null;

  const dateMatch = clean.match(
    /On\s+\w+,\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i
  );
  let date = null;
  let time = null;
  if (dateMatch) {
    const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const mon = months[dateMatch[1].toLowerCase().slice(0, 3)];
    const day = parseInt(dateMatch[2]);
    const year = parseInt(dateMatch[3]);
    let hour = parseInt(dateMatch[4]);
    const min = parseInt(dateMatch[5]);
    const ampm = (dateMatch[6] || '').toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    if (mon !== undefined) {
      const d = new Date(year, mon, day);
      date = d.toISOString().slice(0, 10);
      time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }

  const nameMatch = clean.match(
    /(?:AM|PM)\s+(.*?)(?:\s*<[^>]+>)?\s*(?:wrote|$)/i
  );
  const name = nameMatch ? nameMatch[1].replace(/[,\s]+$/, '').trim() : null;

  return { email, date, time, name, actorId: actorFromEmail(email) || actorFromName(name) };
}

// ─── Text-based thread splitter ──────────────────────────────────────────
//
// Gmail threads in .eml plain text use this structure:
//   [newest message body]
//   On [date] [person] <email>
//   wrote:
//   > [quoted older message]
//   > On [date] [person] <email>
//   > wrote:
//   >> [even older message]
//   ...
//
// "Forwarded message" blocks use:
//   ---------- Forwarded message ---------
//   From: [person] <email>
//   Date: [date]
//   Subject: [subject]
//   To: [recipients]
//   [forwarded body]
//
// We find ALL these boundaries, then extract the body between them,
// stripping the appropriate number of leading ">" characters per depth level.

function splitThreadText(text, mimeSender, mimeDate) {
  if (!text) return [];
  const lines = text.split('\n');
  const messages = [];

  // Find all "On ... wrote:" boundaries (may span 2 lines)
  const boundaries = []; // { lineStart, lineEnd, quoteDepth, attrText }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.replace(/^>+ ?/gm, '');
    const depth = (raw.match(/^(>+)/) || ['', ''])[1].length;

    // Check for "On ... wrote:" on one line
    if (/^On\s+\w+,\s+\w+\s+\d/.test(stripped) && stripped.includes('wrote:')) {
      boundaries.push({ lineStart: i, lineEnd: i, depth, attrText: stripped });
      continue;
    }

    // Check for "On ..." on this line and "wrote:" on the next (or next+1)
    // The email address sometimes wraps: "On ... <\n email@example.org> wrote:"
    if (/^On\s+\w+,\s+\w+\s+\d/.test(stripped) && i + 1 < lines.length) {
      const next1 = lines[i + 1].replace(/^>+ ?/gm, '').trim();
      if (next1 === 'wrote:' || next1.endsWith('wrote:')) {
        boundaries.push({ lineStart: i, lineEnd: i + 1, depth, attrText: stripped + ' ' + next1 });
        continue;
      }
      // 3-line case: "On ...<\n email>\n wrote:"
      if (i + 2 < lines.length) {
        const next2 = lines[i + 2].replace(/^>+ ?/gm, '').trim();
        if (next2 === 'wrote:' || next2.endsWith('wrote:')) {
          boundaries.push({ lineStart: i, lineEnd: i + 2, depth, attrText: stripped + ' ' + next1 + ' ' + next2 });
          continue;
        }
      }
    }

    // Check for "---------- Forwarded message ---------"
    if (/^-{5,}\s*Forwarded message\s*-{5,}/.test(stripped)) {
      // Gather From/Date/Subject/To headers after it
      let headerEnd = i + 1;
      let fwdAttr = '';
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const hs = lines[j].replace(/^>+ ?/gm, '').trim();
        if (/^(From|Date|Subject|To):/.test(hs)) {
          fwdAttr += hs + ' ';
          headerEnd = j + 1;
        } else if (hs === '') {
          headerEnd = j + 1;
          break;
        } else {
          break;
        }
      }
      // Build a synthetic attribution from the From/Date
      const fromMatch = fwdAttr.match(/From:\s*(.*?)(?:\s+Date:|$)/);
      const dateMatch = fwdAttr.match(/Date:\s*(.*?)(?:\s+Subject:|$)/);
      const synth = `On ${dateMatch ? dateMatch[1].trim() : '?'} ${fromMatch ? fromMatch[1].trim() : '?'} wrote:`;
      boundaries.push({ lineStart: i, lineEnd: headerEnd - 1, depth, attrText: synth, isForward: true });
    }
  }

  // Message 0: MIME-level sender, body is everything before first boundary
  const firstBoundaryLine = boundaries.length > 0 ? boundaries[0].lineStart : lines.length;
  const newestBody = lines.slice(0, firstBoundaryLine).join('\n').trim();
  messages.push({
    actorId: actorFromEmail(mimeSender?.address) || actorFromName(mimeSender?.name),
    email: mimeSender?.address,
    date: mimeDate ? mimeDate.toISOString().slice(0, 10) : null,
    time: mimeDate
      ? `${String(mimeDate.getHours()).padStart(2, '0')}:${String(mimeDate.getMinutes()).padStart(2, '0')}`
      : null,
    bodyText: newestBody,
  });

  // For each boundary, the message body is the lines after the boundary
  // up to the NEXT boundary at the same or lesser quote depth.
  for (let bi = 0; bi < boundaries.length; bi++) {
    const b = boundaries[bi];
    const parsed = parseAttribution(b.attrText);
    if (!parsed) continue;

    const bodyStartLine = b.lineEnd + 1;
    let bodyEndLine;

    // Find next boundary at same or shallower depth
    if (bi + 1 < boundaries.length) {
      bodyEndLine = boundaries[bi + 1].lineStart;
    } else {
      bodyEndLine = lines.length;
    }

    // Extract body lines and strip leading ">" at this depth level
    const bodyLines = [];
    for (let li = bodyStartLine; li < bodyEndLine; li++) {
      let line = lines[li];
      // Strip exactly `b.depth` leading ">" characters
      for (let d = 0; d < b.depth; d++) {
        line = line.replace(/^> ?/, '');
      }
      bodyLines.push(line);
    }

    let bodyText = bodyLines.join('\n').trim();
    // Strip any remaining leading ">" from all lines (residual quoting)
    if (bodyText.startsWith('>')) {
      bodyText = bodyText
        .split('\n')
        .map(l => l.replace(/^> ?/, ''))
        .join('\n')
        .trim();
    }
    messages.push({
      ...parsed,
      bodyText,
    });
  }

  return messages;
}

// ─── Match messages to evidence docs ─────────────────────────────────────
function matchMessagesToEvidence(messages, evidenceDocs) {
  const assignments = new Map();

  const sorted = [...evidenceDocs].filter(d => d.type === 'email');

  for (const doc of sorted) {
    let bestMatch = null;
    let bestScore = -1;

    for (const msg of messages) {
      let score = 0;

      if (msg.actorId && msg.actorId === doc.source) score += 10;
      else if (msg.actorId && msg.actorId !== doc.source) continue;
      else if (!msg.actorId) score += 1;

      if (msg.date && msg.date === doc.date) score += 5;
      else if (msg.date && msg.date !== doc.date) continue;

      // Time proximity — tighter match = higher score
      if (msg.time && doc.time) {
        const msgMins = timeToMins(msg.time);
        const docMins = timeToMins(doc.time);
        if (msgMins !== null && docMins !== null) {
          const diff = Math.abs(msgMins - docMins);
          if (diff <= 5) score += 4;
          else if (diff <= 30) score += 3;
          else if (diff <= 120) score += 2;
          else score += 1;
        }
      }

      if (msg.bodyText && msg.bodyText.length > 50) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = msg;
      }
    }

    if (bestMatch && bestMatch.bodyText && bestMatch.bodyText.length > 20) {
      assignments.set(doc.id, bestMatch.bodyText);
    }
  }

  return assignments;
}

function timeToMins(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  const emlFiles = readdirSync(SOURCES).filter(f => f.endsWith('.eml'));

  const threads = [];

  for (const emlFile of emlFiles) {
    console.log(`\nParsing: ${emlFile}`);
    const raw = readFileSync(join(SOURCES, emlFile));
    const parsed = await simpleParser(raw);

    const threadDef = EML_TO_THREAD[emlFile];
    if (!threadDef) {
      console.warn(`  No thread mapping for ${emlFile}`);
      continue;
    }

    // Set threadId on evidence docs belonging to this thread
    for (const docId of threadDef.docIds) {
      const ev = data.evidence.find(e => e.id === docId);
      if (ev) ev.threadId = threadDef.id;
    }

    // Split text into individual messages
    const senderAddr = parsed.from?.value?.[0] || parsed.from;
    const messages = splitThreadText(
      parsed.text,
      { address: senderAddr?.address, name: senderAddr?.name || parsed.from?.text },
      parsed.date
    );

    console.log(`  Found ${messages.length} messages:`);
    for (const msg of messages) {
      console.log(`    ${msg.actorId || '?'} | ${msg.date} ${msg.time || ''} | ${msg.bodyText?.length || 0} chars | "${(msg.bodyText || '').slice(0, 55).replace(/\n/g, '\\n')}"`);
    }

    // Match messages to evidence docs
    const threadEvidence = data.evidence.filter(
      e => threadDef.docIds.includes(e.id) && e.type === 'email'
    );
    const assignments = matchMessagesToEvidence(messages, threadEvidence);

    for (const [docId, bodyText] of assignments) {
      const ev = data.evidence.find(e => e.id === docId);
      if (ev) {
        ev.bodyText = bodyText;
        console.log(`  ✓ ${docId} → ${bodyText.length} chars`);
      }
    }

    for (const ev of threadEvidence) {
      if (!assignments.has(ev.id)) {
        console.log(`  ✗ ${ev.id} (${ev.source} ${ev.date} ${ev.time}) — no match, using summary`);
        ev.bodyText = ev.summary || null;
      }
    }

    threads.push({ ...threadDef, emlFile });
  }

  // Ensure non-email evidence has bodyText set
  for (const ev of data.evidence) {
    if (!ev.bodyText) ev.bodyText = null;
  }

  data.threads = threads;

  if (data.authorities) {
    data.sources = data.authorities.map(auth => ({
      ...auth,
      url: SOURCE_URLS[auth.id] || null
    }));
    delete data.authorities;
  }

  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');

  const emailEvidence = data.evidence.filter(e => e.type === 'email');
  const withBody = emailEvidence.filter(e => e.bodyText && e.bodyText !== e.summary);
  const uniqueBodies = new Set(withBody.map(e => e.bodyText.slice(0, 100)));
  const dupes = withBody.length - uniqueBodies.size;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done. Updated ${DATA_FILE}`);
  console.log(`  Threads: ${threads.length}`);
  console.log(`  Email evidence: ${emailEvidence.length}`);
  console.log(`  With distinct bodyText: ${withBody.length}`);
  console.log(`  Unique body prefixes: ${uniqueBodies.size}`);
  console.log(`  Duplicate bodies: ${dupes}`);
  console.log(`  Summary-only fallback: ${emailEvidence.filter(e => !e.bodyText || e.bodyText === e.summary).length}`);
  if (data.sources) {
    console.log(`  Sources with URLs: ${data.sources.filter(s => s.url).length}`);
  }
}

main().catch(console.error);
