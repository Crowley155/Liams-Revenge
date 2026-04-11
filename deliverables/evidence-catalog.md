# Evidence Catalog — Liam Crowley / Mize Elementary / JCPRD / USD 232

**Compiler:** Agent A (Evidence Compiler)  
**Data layer:** `data/case-data.json` — evidence, timeline, contradictions, evidenceGaps arrays  
**Related deliverables:** `legal-strategy-memo.md` (strategy), `usd232-policy-analysis.md` (policies), `media-briefing-package.md` (reporter materials)  
**Interactive briefing:** React app `app/` (`npm run dev` / `npm run build` → `dist/`)  
**Sources:** Six workspace `.eml` files (April 2026 correspondence + Fall 2025 `This morning.eml`) + Schwanz board memo.  
**Methodology:** `case-file-manager` SKILL.md (intake, timeline, contradictions, gaps).

**Note on encoding:** Plain text was taken from `text/plain` or `quoted-printable` parts. `JCPRD at Mize Elementary.eml` body was **base64** in the primary part; it was **decoded with PowerShell** (`[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(...))`) for this catalog. Large **binary attachments** (PDFs, JPEG signatures) were **not** fully extracted to text; where substantive content appears only inside those binaries, this is flagged in **Gap Analysis** and in the relevant DOC row.

---

## 1. Document Catalog Table

| DOC-ID | Date (time if known) | Source | Type | Summary | Key Claims | Contradictions | Supports | Undermines |
|--------|----------------------|--------|------|---------|------------|----------------|----------|------------|
| DOC-001 | 2026-04-05 ~17:28 | Will Crowley | Email | Notifies school Liam absent week of 4/6–4/10 per pediatrician; DCF report; Shawnee PD Case #2601522; return 4/13; no JCPRD OST; requests drop/pickup procedures; email for documentation. [SOURCE: DOC-001] | Pediatrician advised close monitoring seven days; mandatory DCF filing; police case #2601522; OST particulars “limited”; anticipates admin contacted in investigations. [SOURCE: DOC-001] | — | Will (documents injury seriousness & parallel reports) | — |
| DOC-002 | 2026-04-06 ~21:51 | Gerri Balthazor / Mize | Email | Car loop logistics for Liam (back morning, front afternoon). [SOURCE: DOC-002] | Liam can use specified loops; principal available for logistics. [SOURCE: DOC-002] | Does not address safety investigation (parent raised separately in thread). [SOURCE: DOC-002 vs DOC-003] | USD 232 (logistics responsiveness) | Will (does not engage safety substance in same message) |
| DOC-003 | 2026-04-07 07:55 | Will Crowley | Email | Focus on safety: JCPRD report (five staff, zero witnesses); “near-miss” paralysis risk; pediatrician Tier 1 trauma if progression; JCPRD won’t remove older student; asks USD 232 investigation; May board comment; attorney suggested 504 with direct line-of-sight / no contact; trauma limits feeling safe. [SOURCE: DOC-003] | JCPRD admitted no adult witnessed attack; supervision failed; pediatrician warned of spinal injury severity; district should investigate on property; 504-type protections sought. [SOURCE: DOC-003] | vs JCPRD/Leigh tone minimizing harm (see DOC-009). [SOURCE: DOC-003 vs DOC-009] | Will | JCPRD; USD 232 (pressure to act beyond “separate entity”) |
| DOC-004 | 2026-04-07 13:31 | Gerri Balthazor / Mize | Email | JCPRD “separate entity” leasing space; not district-managed after hours; contact Jennifer Anderson; offers school-day safety plan & 504 guidance. [SOURCE: DOC-004] | After-school program staffing/policies/incident response under JCPRD; district will partner on school-day safety plan; 504 process offered. [SOURCE: DOC-004] | vs Will’s cited policy/statute/lease arguments. [SOURCE: DOC-004 vs DOC-006, DOC-013, DOC-023] | USD 232; JCPRD (independence framing) | Will (full-campus safety / investigation ask) |
| DOC-005 | 2026-04-07 14:58 | Will Crowley | Email | Asks if district refuses independent investigation and to confirm no duty of care after hours; states **prior email was formal request for 504 evaluation**. [SOURCE: DOC-005] | Written 504 request; seeks clear district position on duty outside school hours. [SOURCE: DOC-005] | vs USD 232 messaging that concerns are routed by program boundary. [SOURCE: DOC-005 vs DOC-004, DOC-012] | Will | USD 232 (clarity on 504 + jurisdiction) |
| DOC-006 | 2026-04-08 09:01 | Will Crowley | Email (formal grievance) | Letter to Alvie Cater (draft to Dr. Gibson/Board): battery 4/2; building leadership said no authority after 3:45 / JCPRD; cites USD 232 policy “on school property,” K.S.A. 72-6114, lease/constructive possession, prior notice, custodial program vs recreational immunity; seeks administrative resolution and investigation. [SOURCE: DOC-006] | Undisputed battery on grounds; medical team cited paralysis risk; **school lacks authority after 3:45 PM during JCPRD** as stated to parent; policy and statute cited as contradicting time-limited duty. [SOURCE: DOC-006] | vs Gerri/Alvie JCPRD independence. [SOURCE: DOC-006 vs DOC-004, DOC-012] | Will | USD 232 (jurisdiction defense); JCPRD |
| DOC-007 | 2026-04-08 09:46 | Alvie Cater / USD 232 | Email | Proposes meeting **Mon 4/13 1:00 p.m.** De Soto; wants to discuss ongoing bullying claim. [SOURCE: DOC-007] | District willing to schedule meeting on concerns. [SOURCE: DOC-007] | Later canceled (DOC-014). [SOURCE: DOC-007 vs DOC-014] | USD 232 (initial engagement) | — (until cancellation) |
| DOC-008 | 2026-04-08 10:59 | Will Crowley | Email | Accepts meeting; expects district to act on student safety **regardless of time**; if authority stops at 3:45, little to discuss; background on year-long clique; **“Liam does not understand the difference between JCPRD and the school day”**; hard to parse day vs aftercare; **“we believe it has occurred exclusively during the aftercare program”**; JCPRD said five staff outside—report said none witnessed 4/2. [SOURCE: DOC-008] | Meeting conditions; developmental/context point on JCPRD vs school; reliance on five-staff reassurance; report undermines prior trust. [SOURCE: DOC-008] | **Alvie later quotes “exclusively during the aftercare program” as grounding JCPRD authority** (DOC-012). [SOURCE: DOC-008 vs DOC-012] | Will (nuance + lease/safety theory in thread) | USD 232 (used in DOC-012 to limit district scope) |
| DOC-009 | 2026-04-03 17:44 | Leigh White / JCPRD | Email | First responsive email: safety priority; situation “handled” with children/parents; staff training; mixed ages; JCCL report option; **“I am sorry you feel Liam is being harmed”**; observe program; discuss at pickup. [SOURCE: DOC-009] | Emotional + physical safety top priority; incident “yesterday” handled appropriately; extensive staff training; will review playground supervision. [SOURCE: DOC-009] | vs Will’s characterization of battery and need for written safety plan. [SOURCE: DOC-009 vs DOC-010] | JCPRD | Will |
| DOC-010 | 2026-04-03 18:17 | Will Crowley | Email | Rejects “feeling” framing; staff confirmed battery; no written safety/separation plan; won’t return; pediatrician → DCF; filing police; juvenile age threshold; JCCL complaint. [SOURCE: DOC-010] | Documented battery; DCF cooperation expected; police report filed **Saturday morning**; Monday **manager called** offering copy of final report. [SOURCE: DOC-010] | vs Leigh’s minimization. [SOURCE: DOC-010 vs DOC-009] | Will | JCPRD |
| DOC-011 | 2026-04-09 19:00 | Will Crowley | Email (forward cover) | Forwards JCPRD chain to Alvie: identifies as first JCPRD email and his second response; notes Saturday police + Monday JCPRD manager call re final report. [SOURCE: DOC-011] | Same as embedded DOC-009–010 plus procedural notes. [SOURCE: DOC-011] | — | Will | — |
| DOC-012 | 2026-04-09 ~16:28 | Alvie Cater / USD 232 | Email | Clarifies district position: **not** that safety concerns limited by time of day; **but** incident/concerns occurred in **JCPRD before/after program**; **JCPRD operates independently**; JCPRD responsible for supervision/investigation/response in program hours; **“You indicated in your message that the behavior in question has occurred exclusively during the aftercare program, which places it within JCPRD’s authority.”** Bullets: JCPRD offered meet, parent declined; **KDHE Critical Incident Report** filed; JCPRD addressed staff 4/2; Liam not in JCPRD. [SOURCE: DOC-012] | District commits to Liam during **school day**; overflow behaviors to notify principal; transparency that meeting may not achieve resolution sought. [SOURCE: DOC-012] | vs Will lease §8(d) and “act regardless of clock”; **uses Will’s “exclusively” language**. [SOURCE: DOC-012 vs DOC-008, DOC-013] | USD 232; JCPRD | Will (district-wide remedy) |
| DOC-013 | 2026-04-09 16:46 | Will Crowley | Email | Declines JCPRD meeting over refusal to amend report; other parents “talked to,” no action; not “handled”; wants internal investigation; **quotes lease §8(d)** (“Lessee will abide by… all rules, regulations, and policies adopted by the Board…”); asks if another agreement supersedes lease. [SOURCE: DOC-013] | JCPRD misaligned with lease; district should not abdicate; entrustment based on lease language. [SOURCE: DOC-013] | vs Alvie's independent JCPRD framing. [SOURCE: DOC-013 vs DOC-012] | Will | USD 232; JCPRD |
| DOC-014 | 2026-04-10 12:44 UTC (~07:44 Central) | Alvie Cater / USD 232 | Email | **Cancels meeting:** “It sounds like we are not be aligned on this, so I will go ahead and cancel the meeting.” Redirects to **JCPRD as licensed childcare** under Kansas rules; concerns to **JCPRD and if necessary KDHE**. [SOURCE: DOC-014] | Meeting off; administrative path through JCPRD/KDHE. [SOURCE: DOC-014] | vs prior scheduled meeting (DOC-007, DOC-008). [SOURCE: DOC-014 vs DOC-007] | USD 232 (closes district meeting path) | Will |
| DOC-015 | 2026-04-06 14:18 | Amy Branson / JCPRD | Email | **Attached JCPRD incident form** from prior week; refund 5–7 business days. [SOURCE: DOC-015] | Incident form completed immediately after incident; refund processing. [SOURCE: DOC-015] | Will disputes form accuracy (DOC-016). [SOURCE: DOC-015 vs DOC-016] | JCPRD (documentation) | Will (acceptance of narrative) |
| DOC-016 | 2026-04-06 15:11 | Will Crowley | Email | Detailed critique of incident report: hearsay; biased; witness list vs narrative; **“No medical treatment was necessary”** vs no medic called; **quotes teacher saw only “end of the conflict”**; disputes accidental vs intentional “elbow drop”; sister/sleep narrative; **same-room questioning** with older child improper. [SOURCE: DOC-016] | Lists internal inconsistencies; medical and procedural failures. [SOURCE: DOC-016] | vs DOC-020 substance as described by JCPRD; vs DOC-017. [SOURCE: DOC-016 vs DOC-017, DOC-020] | Will | JCPRD |
| DOC-017 | 2026-04-06 15:31 | Jennifer Anderson / JCPRD | Email | Report written **day incident occurred**; does not include later information; **KDHE/local licensing report when parent notified medical care**; offers meeting/discussion. [SOURCE: DOC-017] | Timing of report and regulatory notifications tied to medical notification. [SOURCE: DOC-017] | vs Will’s claim report rushed to close books (DOC-016, DOC-019). [SOURCE: DOC-017 vs DOC-016] | JCPRD | Will |
| DOC-018 | 2026-04-06 15:56 | Will Crowley | Email | Declines meeting unless records corrected; hopes 9-year-old’s pattern doesn’t harm others; will escalate to school/board re JCPRD values vs contract. [SOURCE: DOC-018] | No meeting without record correction. [SOURCE: DOC-018] | vs DOC-017 offer to meet. [SOURCE: DOC-018 vs DOC-017] | Will | JCPRD |
| DOC-019 | 2026-04-10 06:37 | Will Crowley | Email | To Jennifer Anderson: clarifies “refusal” to meet = refusal of box-checking; demands amend report, real investigation, structural fixes; bullets—safety failure, **lease §8(d)** vs “own rules,” consent form limits, accountability, mixed-age excuse; **administrative channel closed** absent substance; focus on accountability. **Attachment present in .eml:** `JCPRD lease agreement 2025-26.pdf`. [SOURCE: DOC-019] | Same themes; lease attached for JCPRD. [SOURCE: DOC-019] | vs JCPRD/Alvie positions. [SOURCE: DOC-019 vs DOC-012, DOC-017] | Will | JCPRD; USD 232 |
| DOC-020 | 2026-04-02 (incident date); transmitted 2026-04-06 | JCPRD (form) / Amy Branson | Incident report form | JCPRD incident documentation for 4/2 event. **Full form text not extracted** from `.eml` (no `application/pdf` filename for incident form in this export; Amy asserts attachment). Substantive allegations and **direct quotes** appear in Will’s rebuttal (DOC-016). [SOURCE: DOC-016; transmission DOC-015] | Per Will’s quotations: witness/narrative tension; **“No medical treatment was necessary”**; teacher saw end not whole; accidental fall characterization; Liam statements recorded. [SOURCE: DOC-016] | vs pediatric care/DCF (DOC-001, DOC-003, DOC-010); vs Will’s account. [SOURCE: DOC-020 vs DOC-001, DOC-016] | JCPRD (official record) | Will (if inaccuracies proven) |
| DOC-021 | 2025-07-07 (board approval per skill context); file attached 2026-04-10 | USD 232 / JCPRD | PDF attachment | **`JCPRD lease agreement 2025-26.pdf`** attached to DOC-019. **Body text not extracted** in this catalog. [SOURCE: DOC-019] | Will cites **§8(d)** obligation in email text (DOC-013, DOC-019). [SOURCE: DOC-013] | Alleged tension with “independent operator” statements (DOC-004, DOC-012). [SOURCE: DOC-021 cited via DOC-013 vs DOC-012] | Will | USD 232; JCPRD (if lease enforceable as parent alleges) |
| DOC-022 | 2026-04-08 08:38 | Gerri Balthazor / Mize | Email | Adds **Alvie** for first inquiry; adds **Janine Winters** “regarding the 504 process.” [SOURCE: DOC-022] | 504 routed to counselor contact. [SOURCE: DOC-022] | vs typical 504 coordinator routing (per case-file skill note—not in emails). [SOURCE: DOC-022 + external procedure note] | USD 232 | Will (formal 504 path) |
| DOC-023 | 2026-04-09 07:11 | Will Crowley | Email | Empathy to staff; Monday meeting with Alvie; **§8(d)** quote; “separate entity” frustration; fire marshal / age separation / “danger of overrunning”; **“size and limited motor skills”**; district/JCPRD refusal to investigate “**is the issue**”; image + lease full copy referenced. [SOURCE: DOC-023] | District authority via lease; physical vulnerability of kindergartners; demands acknowledgment/investigation. [SOURCE: DOC-023] | vs Gerri/Alvie framing. [SOURCE: DOC-023 vs DOC-004, DOC-012] | Will | USD 232 |
| DOC-024 | 2026-04-09 15:48 | Janine Winters / USD 232 | Email | References **afternoon phone call**; sends **504 fact sheet**; **“As I understood during our conversation, this is not the avenue you would like to move forward with at this time.”**; small-group permission slip included; meet Monday drop-off. [SOURCE: DOC-024] | Memorializes parent choice re 504; offers future 504 if desired; counseling options. [SOURCE: DOC-024] | vs formal written 504 request (DOC-005); **verbal characterization of 504 not in .eml** (see §3). [SOURCE: DOC-024 vs DOC-005] | USD 232 (paper trail) | Will (if 504 request improperly closed) |
| DOC-025 | 2026-04-10 08:26 | Will Crowley | Email | No 1:1 counselor sessions without parent; private providers; pending **“lawsuit for equitable relief”**; won’t discuss incident/psych/legal with staff further. [SOURCE: DOC-025] | Limits district counseling; litigation disclosed. [SOURCE: DOC-025] | — | Will | USD 232 (counseling coordination) |
| DOC-026 | (attached 2026-04-09; not extracted) | USD 232 | Referenced attachment | **Section 504 Parent Information Sheet** referenced in DOC-024. **No decodable PDF/text located** in `Liam Crowley Absence 4_6 thru 4_10 (1).eml` (only `image.png` attachment header found in grep). [SOURCE: DOC-024; gap: file] | (Unknown in evidence—content not in workspace export.) [SOURCE: GAP] | Alleged vs Janine phone characterization **not documented in .eml** (see §3). [SOURCE: GAP vs DOC-024] | — | — |
| DOC-027 | (attached 2026-04-09; not extracted) | USD 232 | Referenced attachment | **Small group counseling permission** referenced in DOC-024. **Not extracted** from provided `.eml`. [SOURCE: DOC-024; gap: file] | Voluntary counseling pathway. [SOURCE: DOC-024 text] | Offered same day as 504 memorialization. [SOURCE: DOC-024 vs DOC-005] | USD 232 | Will (if substitute for 504 process) |
| DOC-028 | 2025-09-18 ~13:03 | BreAnna Burks / Mize | Email | Re: **This morning** — kindergarten perspective: **no intermingling of age groups at recess** during school day; kindergartners on green turf; **typically 3–4 adults** supervising; Book Buddies exception; JCPRD/before-after to Balthazor and Leigh White. [SOURCE: DOC-028; `This morning.eml`] | Written recess/supervision rules as stated by USD 232 staff. [SOURCE: DOC-028] | Tension with parent’s Sep 18 reply (embedded in DOC-029): policy vs. child’s detailed account. **C-13** (institutional credibility vs. April 2026 facts). | USD 232 (policy articulation) | Opponent misuse re “prior prank” if framed as child impeachment |
| DOC-029 | 2025-09-19 ~05:18 | Will Crowley | Email | Re: **This morning** — Liam said recess and JCPRD incidents were “pranks”; parent works imagination vs. dishonesty; thanks Leigh White; consequences at home; **quoted** prior message: under Burks’s policies account “should not have been possible”; consistency/detail made fabrication hard to believe; asks if policy always followed. [SOURCE: DOC-029; `This morning.eml`] | Good-faith cooperation; developmental framing; preserved policy-vs-account conflict in writing. [SOURCE: DOC-029] | **C-13**; narrative risk if opponent ignores context. | Will (credibility + context) | Opponent “liar” framing (rebut via development + April 2026 corroboration) |

**Non-substantive binaries:** `image001.jpg` / embedded CID images (email signatures/banners) appear in multiple messages; not separately cataloged. [SOURCE: parent emails]

---

## 2. Master Chronological Timeline

Format: `[DATE] [TIME if known] — [ACTOR] — [ACTION] — [DOC-ID]`

```
[2026-04-02] [time unknown] — Unknown / JCPRD OST — Physical altercation involving Liam Crowley on Mize grounds during JCPRD program — [referenced DOC-016, DOC-003, DOC-006]
[2026-04-03] [17:44] — Leigh White (JCPRD) — Sends first responsive email to Will — DOC-009
[2026-04-03] [18:17] — Will Crowley — Replies to Leigh: DCF, police filing, JCCL — DOC-010
[2026-04-04] [Saturday AM] — Will Crowley — Files Shawnee PD report Case #2601522 — DOC-010, DOC-001
[2026-04-05] [~17:28] — Will Crowley — Emails teachers: absence 4/6–4/10, DCF, police, procedures — DOC-001
[2026-04-06] [Monday] — JCPRD manager — Phone call offering copy of final report — DOC-011
[2026-04-06] [14:18] — Amy Branson (JCPRD) — Sends incident form + refund notice — DOC-015
[2026-04-06] [15:11] — Will Crowley — Sends detailed rebuttal of incident report — DOC-016
[2026-04-06] [15:31] — Jennifer Anderson (JCPRD) — Responds on report timing, KDHE/licensing, offers meeting — DOC-017
[2026-04-06] [15:56] — Will Crowley — Declines meeting — DOC-018
[2026-04-06] [~21:51] — Gerri Balthazor — Car loop logistics — DOC-002
[2026-04-07] [07:55] — Will Crowley — Safety, medical severity, investigation, 504-related requests — DOC-003
[2026-04-07] [13:31] — Gerri Balthazor — JCPRD separate entity; school-day plan; 504 guidance — DOC-004
[2026-04-07] [14:58] — Will Crowley — Formal 504 evaluation request; asks district position on after-hours duty — DOC-005
[2026-04-08] [08:38] — Gerri Balthazor — Routes to Alvie Cater + Janine Winters for 504 — DOC-022
[2026-04-08] [09:01] — Will Crowley — Formal grievance letter (battery, policy, statute, lease theories) — DOC-006
[2026-04-08] [09:46] — Alvie Cater — Proposes in-person meeting Mon 4/13 1:00 PM — DOC-007
[2026-04-08] [10:59] — Will Crowley — Accepts meeting; expectations; aftercare vs school-day parsing; five-staff quote — DOC-008
[2026-04-09] [07:11] — Will Crowley — Staff email: lease §8(d), fire marshal, age separation, investigation demand — DOC-023
[2026-04-09] [afternoon] — Janine Winters — Phone call with Will (referenced, not transcribed in .eml) — DOC-024
[2026-04-09] [15:48] — Janine Winters — Email: 504 fact sheet + permission slip; memorializes conversation re not pursuing 504 — DOC-024
[2026-04-09] [~16:28] — Alvie Cater — Email: JCPRD independence; uses Will’s “exclusively aftercare”; KDHE critical incident bullets — DOC-012
[2026-04-09] [16:46] — Will Crowley — Reply: lease §8(d); declined JCPRD meeting reasons — DOC-013
[2026-04-09] [19:00] — Will Crowley — Forwards Leigh/Will JCPRD chain to Alvie — DOC-011
[2026-04-10] [06:37] — Will Crowley — Final email to Jennifer Anderson; closes admin channel; attaches lease PDF — DOC-019, DOC-021
[2026-04-10] [12:44 UTC / ~07:44 Central] — Alvie Cater — Cancels 4/13 meeting; redirect JCPRD/KDHE — DOC-014
[2026-04-10] [08:26] — Will Crowley — Declines school counseling without parent; cites pending lawsuit — DOC-025
```

---

## 3. Contradiction Analysis

Each item: conflicting quotes (exact where available), DOC-IDs, and why it matters.

### C-1: JCPRD incident report — adult witness narrative vs witness list
- **Claim A:** Narrative: teacher **“did not see the whole incident, but did see the end of the conflict.”** [SOURCE: DOC-016, quoting DOC-020]
- **Claim B:** Form lists **“Staff”** and **“Leigh White”** as witnesses while description indicates staff did not see the event; **“Leigh White did not witness the event”** (parent’s factual assertion). [SOURCE: DOC-016]
- **DOC-IDs:** DOC-020 (report); DOC-016
- **Why it matters:** Undercuts reliability of official report and supervision account for investigations and public bodies.

### C-2: “No medical treatment necessary” vs pediatric assessment and reports
- **Claim A:** Report states **“No medical treatment was necessary”** and **no medical personnel were called** (per Will’s reading). [SOURCE: DOC-016]
- **Claim B:** Pediatrician advised **seven-day monitoring**; **DCF** mandatory report; concern for **Tier 1 trauma center** if spinal inflammation progressed; police case filed. [SOURCE: DOC-001, DOC-003, DOC-010]
- **DOC-IDs:** DOC-020 (via DOC-016); DOC-001, DOC-003, DOC-010
- **Why it matters:** Material to severity, mandatory reporting, and whether program’s on-site health judgment was adequate.

### C-3: Accidental fall vs intentional “elbow drop”
- **Claim A:** Report characterization **“accidentally falling on him in the process.”** [SOURCE: DOC-016, quoting DOC-020]
- **Claim B:** **“Liam described this as an intentional ‘elbow drop’”** (body weight on Liam). [SOURCE: DOC-016]
- **DOC-IDs:** DOC-020 (via DOC-016); DOC-016
- **Why it matters:** Intent vs accident affects discipline, licensing, and law-enforcement framing.

### C-4: USD 232 “no jurisdiction / after 3:45” vs parent’s policy and statute claims
- **Claim A:** Principal’s track: **after 3:45 / JCPRD program** means school **lacks authority to investigate** (as summarized by Will). [SOURCE: DOC-006]
- **Claim B:** Will cites **USD 232 policy** bullying **“on school property”** without after-hours exclusion and **K.S.A. 72-6114** “regardless of the time of day.” [SOURCE: DOC-006]
- **DOC-IDs:** DOC-006; Gerri’s related **separate entity** articulation DOC-004
- **Why it matters:** Core legal/administrative dispute over duty on leased premises.

### C-5: USD 232 / Alvie — “JCPRD operates independently” vs lease §8(d)
- **Claim A:** **“JCPRD leases space from the district and operates its program independently, with its own staff, policies, procedures, and supervisory responsibilities.”** [SOURCE: DOC-012]
- **Claim B:** Will quotes lease: **“Lessee will abide by... all rules, regulations, and policies adopted by the Board of Education of the School District...”** [SOURCE: DOC-013]
- **DOC-IDs:** DOC-012; DOC-013; also DOC-019, DOC-021 (attachment)
- **Why it matters:** If lease is operative, **independence rhetoric may not match contractual duties** toward Board policy.

### C-6: Janine Winters — phone-based 504 path vs formal written 504 request
- **Claim A:** **“My prior email was a formal request for a 504 evaluation.”** [SOURCE: DOC-005]
- **Claim B:** Janine: **“As I understood during our conversation, this is not the avenue you would like to move forward with at this time.”** [SOURCE: DOC-024]
- **DOC-IDs:** DOC-005; DOC-022 (routing to counselor); DOC-024
- **Why it matters:** Whether a **written 504 referral** was properly processed vs **closed via call + follow-up email** (504 “bait-and-switch” pattern in skill file).

### C-7: Janine — verbal 504 characterization vs attached fact sheet (content not in .eml)
- **Claim A (not in email body):** Skill methodology flags counselor **verbally** characterizing 504 as **only medical**—**this conversation is not transcribed** in the five `.eml` files. [SOURCE: GAP — verbal; compare DOC-024 “Per our conversation”]
- **Claim B:** **Unknown verbatim** from fact sheet—**DOC-026 not extracted** from workspace export. [SOURCE: DOC-026 gap]
- **DOC-IDs:** DOC-024; DOC-026; DOC-005
- **Why it matters:** Cannot complete **quote-vs-quote** comparison from this evidence set alone; obtaining DOC-026 text is necessary.

### C-8: The “Alvie trap” — Will’s “exclusively aftercare” vs fuller context Will provided
- **Claim A (Will):** **“Liam does not understand the difference between JCPRD and the school day”** and parsing is hard; **“we believe it has occurred exclusively during the aftercare program.”** [SOURCE: DOC-008]
- **Claim B (Alvie):** **“You indicated in your message that the behavior in question has occurred exclusively during the aftercare program, which places it within JCPRD’s authority.”** [SOURCE: DOC-012]
- **DOC-IDs:** DOC-008; DOC-012
- **Why it matters:** Same sentence functions **narrowly** in Alvie's email as **jurisdictional anchor**, while Will’s same message also argues **district must act regardless of clock** and gives **child-cognition** context. [SOURCE: DOC-008, DOC-012]

### C-9: JCPRD “offered meeting / parent declined” vs Will’s stated reason
- **Claim A:** **“JCPRD indicated that they offered to meet with you in person... and understand that you declined that opportunity.”** [SOURCE: DOC-012]
- **Claim B:** Will: declined JCPRD **“because of their refusal to amend the report they filed”** and wants **internal investigation based on facts**. [SOURCE: DOC-013]
- **DOC-IDs:** DOC-012; DOC-013; DOC-018, DOC-019
- **Why it matters:** **Motives for declining** differ—credentialing “refusal to engage” vs **conditional engagement** on report/investigation.

### C-10: Scheduled meeting vs cancellation
- **Claim A:** **“Monday at 1:00 PM works for me.”** [SOURCE: DOC-008]
- **Claim B:** **“I will go ahead and cancel the meeting.”** [SOURCE: DOC-014]
- **DOC-IDs:** DOC-007, DOC-008; DOC-014
- **Why it matters:** Shows **breakdown of district administrative resolution path** within 48 hours of Alvie's 4/9 email.

---

## 4. Gap Analysis

| Missing item | Why it matters | How to obtain |
|--------------|----------------|---------------|
| **JCPRD incident report PDF / native file** | Primary official record; parent quotes need verification against original | Request copy from JCPRD; compare to email attachment version; KORA if applicable [SOURCE: DOC-015, GAP] |
| **Section 504 Parent Information Sheet (DOC-026)** | Needed to compare **written** district 504 definition vs counselor email | Obtain from district or from mailbox export with attachments preserved [SOURCE: DOC-024, GAP] |
| **Small group counseling permission (DOC-027)** | Completes record of what was offered alongside 504 memorialization | Same as above [SOURCE: DOC-024, GAP] |
| **Transcript/recording of Apr 9 Winters call** | Resolves **504 bait-and-switch** and **verbal vs written** 504 claims | Parent notes + follow-up written questions to district; counsel if represented [SOURCE: DOC-024, GAP] |
| **KDHE Critical Incident Report** (as filed) | Alvie's email asserts filing—**third-party record** of what JCPRD reported | KDHE inquiry / KORA; confirm confidentiality rules [SOURCE: DOC-012] |
| **JCPRD supervision/staffing logs (4/2)** | Verify five-staff-on-playground claims | KORA to JCPRD [SOURCE: DOC-003, DOC-008] |
| **Shawnee PD case file #2601522** | Independent law-enforcement record | Records request [SOURCE: DOC-001, DOC-010] |
| **DCF records** | Mandatory reporter follow-through | Authorized release processes [SOURCE: DOC-001, DOC-010] |
| **Pediatric chart / visit note** | Objective injury mechanism and instructions | Medical records request [SOURCE: DOC-001, DOC-003] |
| **Full lease agreement text (extracted)** | Litigate / advocate §8(d) and other clauses | PDF already attached in DOC-019—**extract text** for exhibit use [SOURCE: DOC-021] |

---

## Return summary (compiler)

| Metric | Count |
|--------|------:|
| **Documents cataloged (DOC-001–DOC-027)** | **27** |
| **Timeline entries (§2)** | **27** |
| **Contradiction analyses (§3)** | **10** |
| **Key gaps** | Incident PDF, 504 fact sheet & permission files in export, phone-call record, KDHE report, logs, PD/DCF/pediatric records, extracted lease text |

**File written:** `c:\Users\willi\Desktop\VStudio\Liams Revenge\deliverables\evidence-catalog.md`
