import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, "..", "data", "case-data.json");
const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

data.phases = [
  {
    id: "phase-1",
    title: "The Setup",
    subtitle: "Board approves lease, safety assurances given, early warning signs",
    dateRange: "Jun 2024 – Sep 2025",
    hasTimeGapAfter: true,
    eventIds: ["T-00", "T-01", "T-01b", "T-01c", "T-01d"],
    daySummaries: {
      "2024-06-26": "USD 232 asks its board to approve JCPRD's lease — calling the program 'invaluable childcare.'",
      "2025-07-07": "Board approves the lease, including Section 8(d) requiring JCPRD to follow all school policies.",
      "2025-09-18": "School staff confirm kindergartners are never mixed with older kids at recess. Parent flags that Liam's account contradicts this policy.",
      "2025-09-19": "Liam calls the incidents 'pranks.' Parent works with staff in good faith to sort it out."
    }
  },
  {
    id: "phase-2",
    title: "The Assault",
    subtitle: "A 9-year-old attacks a 6-year-old on school grounds — five staff present, zero witnesses",
    dateRange: "Apr 2, 2026",
    eventIds: ["T-02"],
    daySummaries: {
      "2026-04-02": "A 9-year-old physically assaults Liam on the Mize Elementary playground during JCPRD's aftercare program. Five JCPRD staff are outside. Not a single adult witnesses the attack."
    }
  },
  {
    id: "phase-3",
    title: "The Response",
    subtitle: "JCPRD minimizes, parent escalates to police and DCF",
    dateRange: "Apr 3–5",
    eventIds: ["T-03", "T-04", "T-05", "T-06"],
    daySummaries: {
      "2026-04-03": "JCPRD's first response frames the documented battery as a 'feeling.' Parent fires back with facts and announces DCF and police filings.",
      "2026-04-04": "Parent files a formal police report. Case #2601522.",
      "2026-04-05": "Parent notifies school: Liam will be absent for a week on pediatrician's orders."
    }
  },
  {
    id: "phase-4",
    title: "The Cover-Up",
    subtitle: "JCPRD's incident report contradicts medical evidence; parent documents every discrepancy",
    dateRange: "Apr 6",
    eventIds: ["T-07", "T-08", "T-09", "T-10", "T-11", "T-12"],
    daySummaries: {
      "2026-04-06": "JCPRD sends the incident report. Parent's detailed rebuttal exposes: witnesses who didn't see anything listed as witnesses, 'no medical treatment necessary' vs. pediatric escalation, 'accidental' vs. intentional. JCPRD admits the report was written day-of and doesn't include later information."
    }
  },
  {
    id: "phase-5",
    title: "The Deflection",
    subtitle: "'Separate entity' — the district disclaims responsibility for its own building",
    dateRange: "Apr 7–8",
    eventIds: ["T-13", "T-14", "T-15", "T-16", "T-17", "T-18", "T-19"],
    daySummaries: {
      "2026-04-07": "Parent lays out the full safety case to school staff. Principal responds: JCPRD is a 'separate entity' — not our problem. Parent asks point-blank: is the district refusing to investigate?",
      "2026-04-08": "Parent sends formal grievance citing the lease, state law, and school policy. Alvie Cater proposes a meeting. Parent accepts and sets expectations."
    }
  },
  {
    id: "phase-6",
    title: "The Shutdown",
    subtitle: "District uses parent's own words against him, then cancels the meeting when he cites the lease",
    dateRange: "Apr 9–10",
    eventIds: ["T-20", "T-21", "T-22", "T-23", "T-24", "T-25", "T-26", "T-27", "T-28"],
    daySummaries: {
      "2026-04-09": "Alvie Cater sends the district's official position: JCPRD 'operates independently,' cherry-picks the parent's words for a jurisdiction dodge, and claims the parent 'declined' JCPRD's meeting. Parent immediately replies with the lease quote. Separately, school counselor memorializes parent's alleged 504 withdrawal from a phone call.",
      "2026-04-10": "Alvie Cater cancels the meeting — the morning after the parent cited the lease. Parent closes the JCPRD administrative channel and discloses pending litigation."
    }
  }
];

writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log("✓ Phases added to case-data.json:", data.phases.length, "phases");
console.log("  Events covered:", data.phases.reduce((s, p) => s + p.eventIds.length, 0), "/", data.timeline.length);
