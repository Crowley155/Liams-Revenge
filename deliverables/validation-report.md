# Validation Report — Media Briefing Package

**Validator:** Agent D (Fact Validator)  
**Date:** April 10, 2026  
**Data layer:** `data/case-data.json` — all arrays used for cross-validation  
**Interactive briefing:** `briefing/index.html`  
**Validated document:** `deliverables/media-briefing-package.md`  
**Source-of-truth documents:** `deliverables/evidence-catalog.md`, `deliverables/legal-research-memo.md`, five workspace `.eml` files (plain and quoted-printable bodies read directly; `JCPRD at Mize Elementary.eml` **text/plain** body verified via **base64 decode** of the segment beginning at line 203).

---

## 1. Executive Summary

| Metric | Value |
|--------|--------|
| **Overall confidence** | **MEDIUM** |
| **Total distinct factual / legal / timeline / quote checks performed** | **~96** |
| **Verified** | **~78** |
| **Partially verified** | **~12** |
| **Unverified (depends on missing primary PDF or third-party record)** | **~4** |
| **Incorrect or materially misleading attribution** | **2** |
| **Unsourced (no `[SOURCE:]` on that claim)** | **~18** (mostly framing, “why it matters,” metadata, and one explicitly flagged key question) |

**Top issues**

1. **CRITICAL — Minor identification:** Section 10 (Appendix) lists `.eml` filenames that include the victim’s full name (**Liam Crowley**), conflicting with §9 Off-Limits (“Do NOT share … Victim’s name”) if this package is shared with reporters as-is.
2. **IMPORTANT — Source attribution:** The phrases **“high-impact strike”** / **“high-impact force to the back/spine”** appear in **DOC-006** (Apr 8 grievance), not in **DOC-003** (Apr 7 principal email). The package often attributes that wording to DOC-003 only.
3. **IMPORTANT — Native incident form:** Quotes attributed to the JCPRD form via **DOC-016** are **parent transcription**; **DOC-020** PDF text was **not** extracted in the workspace—reporters should verify against the native form (as the package partly notes).

---

## 2. Fact Sheet Validation

Each bullet in the fenced fact sheet (§2 of the media package) is assessed below.

| # | Claim (as stated) | Status | Source checked | Notes |
|---|-------------------|--------|----------------|--------|
| F1 | Date: April 2, 2026 | **VERIFIED** | DOC-003, DOC-006, DOC-016 (embedded) | Multiple parent statements align. |
| F2 | Location: Mize Elementary playground; USD 232 property during JCPRD OST | **VERIFIED** | DOC-003, DOC-004, addresses in .eml | JCPRD Mize address in Leigh White signature (DOC-009 thread). |
| F3 | Program: JCPRD OST (after-school) | **VERIFIED** | DOC-004, DOC-009 | “After-school program,” OST references. |
| F4 | Victim: 6-year-old kindergartener | **VERIFIED** | DOC-006 (“six year old”), DOC-003 (“kindergartner” / context) | Consistent. |
| F5 | Other student: parent refers to **9-year-old** and pattern | **VERIFIED** | DOC-018 | Source: “I hope that 9 year old doesn't turn his ongoing pattern of abuse toward other children.” |
| F6 | Injury: high-impact strike; spinal paralysis risk; Tier 1 trauma if progression | **PARTIALLY VERIFIED** | DOC-003, DOC-006 | **Tier 1 trauma** and **near-miss paralysis / spinal** framing: **DOC-003** (Apr 7). **“High-impact strike to his back”** and **“literal risk of spinal paralysis”**: **DOC-006** (Apr 8), *not* DOC-003. Package cites DOC-003 for the full cluster—**attribution error**. |
| F7 | Supervision: five JCPRD staff outside; none witnessed assault | **VERIFIED** | DOC-003, DOC-008 | DOC-003: five staff, “zero adults actually witnessed.” DOC-008: five outside/on duty, “not one of them saw it happen.” |
| F8 | DCF: mandatory reporter filing by pediatrician | **VERIFIED** | DOC-001 (embedded Sun Apr 5 5:28 PM), DOC-010 | Parent states pediatrician filed with DCF. |
| F9 | Shawnee PD Case #2601522 | **VERIFIED** | DOC-001, DOC-010 | Same case # in both. |
| F10 | KDHE: district email states JCPRD filed Critical Incident Report | **VERIFIED** | DOC-012 | Decoded base64 body of Alvie Cater **Apr 9** email in `JCPRD at Mize Elementary.eml`: “self-reported … to … KDHE as a **Critical Incident Report**.” |
| F11 | JCPRD form: parent alleges witness/medical/accidental-vs-intentional issues | **PARTIALLY VERIFIED** | DOC-016; DOC-020 N/A text | Assertions are **parent’s reading** of form; **native DOC-020 not extracted**. |
| F12 | Leigh White: training, mixed ages, “handled,” “sorry you feel [child] harmed” | **VERIFIED** | DOC-009 | “situation yesterday with Liam was **handled**”; apology line uses minor’s name in source. |
| F13 | Principal: JCPRD separate entity; school-day plan | **VERIFIED** | DOC-004 | “separate entity that leases space”; after-school staffing/incidents under JCPRD. |
| F14 | Alvie: JCPRD independent; parent “declined” JCPRD meeting; KDHE | **VERIFIED** | DOC-012 | Matches decoded Apr 9 Cater email (independence, bullets on offer/decline, KDHE). |
| F15 | Parent declined JCPRD meeting over refusal to amend report | **VERIFIED** | DOC-013 (embedded in same base64 thread), DOC-018 | Will: declined to meet until records corrected / amend report. |
| F16 | Lease §8(d) Board policy compliance | **VERIFIED** | DOC-013, DOC-019 (body quotes); DOC-021 PDF not read | Email text quotes §8(d); **full lease PDF not decoded** in validation pass. |
| F17 | 2026-04-07 formal 504 evaluation request characterization | **VERIFIED** | DOC-005 | Exact phrase in package matches email. |
| F18 | 2026-04-08 principal routes 504 to Janine Winters | **VERIFIED** | DOC-022 | Wed Apr 8, 8:38 AM Gerri email adds Winters “regarding the 504 process.” |
| F19 | 2026-04-09 Winters email + attachments | **VERIFIED** | DOC-024 | Thu Apr 9, 3:48 PM; quoted line matches. |
| F20 | GAP: DOC-026 not extracted; call not transcribed | **VERIFIED** | evidence-catalog §4, C-7 | Aligns with catalog. |
| F21 | Key Q2 lease vs independence | **VERIFIED** (as question) | DOC-004, DOC-012, DOC-013, DOC-021 | Appropriate doc set. |
| F22 | Key Q3 incident count | **UNVERIFIED** (correctly flagged) | — | Package says **VERIFY BEFORE SHARING**—appropriate. |
| F23 | Key Q4 504 routing | **VERIFIED** (as question) | DOC-005, DOC-022, DOC-024 | Supported. |
| F24 | Key Q5 catastrophic hypothetical | **UNVERIFIED** | — | Analytical; not a factual claim. |

**Executive summary (§1) cross-check**

| Element | Status | Note |
|---------|--------|------|
| Apr 2 incident; JCPRD OST; Mize playground; USD 232 property | **VERIFIED** | DOC-003, DOC-006. |
| Pediatrician monitoring, DCF, PD #2601522 | **VERIFIED** | DOC-001, DOC-003, DOC-010. |
| “High-impact … back/spine” + Tier 1 | **PARTIALLY VERIFIED** | **High-impact / literal spinal paralysis** language is **DOC-006**; **Tier 1 / inflammation** is **DOC-003**. Executive summary cites **DOC-003 only** for the combined sentence—**too narrow**. |
| Investigation refusal / jurisdictional narrative | **VERIFIED** | DOC-004, DOC-012, DOC-013, DOC-014. |
| Lease §8(d) parent quote fragment | **VERIFIED** | DOC-013 / decoded thread. |
| Cater cancel quote (“not be aligned”) | **VERIFIED** | DOC-014 (decoded plain text). |
| 504 / Winters quote | **VERIFIED** | DOC-005, DOC-022, DOC-024. |
| Call not transcribed | **VERIFIED** | Catalog gap C-7. |
| Parent seeks amend report, accountability, lease vs own rules | **VERIFIED** | DOC-019. |
| No 1:1 counseling without parent; private providers; pending lawsuit | **VERIFIED** | DOC-025. |

---

## 3. Timeline Validation

**Method:** Compared timeline entries to **embedded `Date:` / Gmail-style timestamps** inside the five `.eml` files and, for `JCPRD at Mize Elementary.eml`, to **decoded base64** plain text for messages not visible in raw grep.

| Timeline entry | Date/time OK? | Actor OK? | Action OK? | DOC-ID OK? | Timestamp note |
|----------------|---------------|-----------|------------|------------|----------------|
| 2025-07-07 lease board approval | **UNVERIFIED** | N/A | **Not in .eml text** | DOC-021 | PDF attached in DOC-019; **board approval date not extracted** from PDF in workspace. |
| 2026-04-02 altercation | **VERIFIED** | **PARTIALLY** | **VERIFIED** | DOC-003, DOC-016 | “JCPRD OST / children” is reasonable; **no independent witness doc**. |
| 2026-04-03 17:44 Leigh | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-009 | Embedded “Fri, Apr 3, 2026 at **5:44 PM**” in `Incident at JCPRD.eml` (file’s **outer** `Date` is Apr 9—forward; timeline correctly uses **embedded** time). |
| 2026-04-03 18:17 Will | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-010 | Embedded 6:17 PM. |
| 2026-04-04 Saturday PD filing | **VERIFIED** (as parent statement) | **VERIFIED** | **VERIFIED** | DOC-010 | “On Saturday morning, I filed a police report”—not third-party proof of filing time. |
| 2026-04-05 ~17:28 absence email | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-001 | Embedded “Sunday, April 5, 2026 at **5:28 PM**” in absence thread. |
| 2026-04-06 Monday manager call | **VERIFIED** (parent) | **UNVERIFIED** | **VERIFIED** | DOC-011 | **Manager unnamed** in source; narrative only. |
| 2026-04-06 14:18 Amy Branson | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-015 | Embedded “Monday, April 6, 2026 **2:18 PM**.” |
| 2026-04-06 15:11 rebuttal | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-016 | Embedded **3:11 PM**. |
| 2026-04-06 15:31 Anderson | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-017 | Embedded **3:31 PM**. |
| 2026-04-06 15:56 decline meeting | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-018 | Embedded **3:56 PM**. |
| 2026-04-06 ~21:51 Gerri car loop | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-002 | Embedded “Mon, Apr 6, 2026 at **9:51 PM**.” |
| 2026-04-07 07:55 DOC-003 | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-003 | Embedded **7:55 AM** Apr 7. |
| 2026-04-07 13:31 Gerri | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-004 | Embedded **1:31 PM** Apr 7. |
| 2026-04-07 14:58 DOC-005 | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-005 | Embedded **2:58 PM** Apr 7. |
| 2026-04-08 08:38 DOC-022 | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-022 | Embedded **8:38 AM** Apr 8. |
| 2026-04-08 09:01 grievance | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-006 | Structure matches; time in thread. |
| 2026-04-08 09:46 Alvie meeting | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-007 | Embedded **9:46 AM** Apr 8. |
| 2026-04-08 10:59 Will accept | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-008 | **Outer** `Date` on `Formal Grievance…eml` is **Wed 8 Apr 2026 10:58:52** (≈10:59). |
| 2026-04-09 07:11 DOC-023 | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-023 | Embedded Thursday Apr 9 **7:11 AM** in absence thread. |
| 2026-04-09 afternoon Winters call | **VERIFIED** (referenced only) | **VERIFIED** | **VERIFIED** | DOC-024 | No transcript—correct caveat. |
| 2026-04-09 15:48 Winters email | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-024 | Embedded **3:48 PM** Apr 9. |
| 2026-04-09 ~16:28 Alvie | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-012 | Decoded chain: “On Thu, Apr 9, 2026 at **4:28 PM** Alvie Cater wrote.” |
| 2026-04-09 16:46 Will lease email | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-013 | Decoded: “Sent: Thursday, April 9, 2026 **4:46 PM**.” |
| 2026-04-09 19:00 forward to Alvie | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-011 | `Incident at JCPRD.eml` outer `Date: Thu, 9 Apr 2026 19:00:07 -0500`. |
| 2026-04-10 06:37 DOC-019 | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-019 | `JCPRD Incident Report.eml` outer `Date: Fri, 10 Apr 2026 06:37:09 -0500`. |
| 2026-04-10 12:44 UTC / ~07:44 CT cancel | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-014 | Header `Date: Fri, 10 Apr 2026 12:44:28 +0000` → **7:44 AM Central** during DST. |
| 2026-04-10 08:26 DOC-025 | **VERIFIED** | **VERIFIED** | **VERIFIED** | DOC-025 | `Liam Crowley Absence…eml` outer `Date: Fri, 10 Apr 2026 08:26:50 -0500`. |

**Header vs. embedded mismatch (informational):** Several `.eml` containers are **Gmail threads** where the **RFC `Date` header** is the **latest** message (e.g. DOC-011 file dated Apr 9). The media timeline **correctly** uses **embedded** times for historical rows—the evidence catalog uses the same approach.

---

## 4. Quote Verification

| Quote in package | Source | Match |
|------------------|--------|-------|
| “It sounds like we are not be aligned on this, so I will go ahead and cancel the meeting.” | DOC-014 decoded plain text | **EXACT MATCH** (grammar “not be” per source). |
| “As I understood during our conversation, this is not the avenue you would like to move forward with at this time.” | DOC-024 / Janine body | **EXACT MATCH** (Winters also opens with “It was a pleasure…”—package pulls correct sentence). |
| “My prior email was a formal request for a 504 evaluation.” | DOC-005 | **EXACT MATCH** |
| “Lessee will abide by… all rules, regulations, and policies adopted by the Board of Education…” | DOC-013 (parent quoting lease) | **MINOR DIFFERENCE** — source continues “…of the **School District**” and additional conformity language; ellipsis in package is fair. |
| “I am sorry you feel [victim’s name redacted] is being harmed in some way.” | DOC-009 | **MINOR DIFFERENCE** — source: “I am sorry you feel **Liam** is being harmed in some way.” Redaction is intentional; closing words match. |
| “No medical treatment was necessary” (from form) | DOC-016 quoting report | **EXACT MATCH** to parent’s quotation; **COULD NOT CONFIRM** against **native DOC-020** PDF. |
| “JCPRD leases space from the district and operates its program independently, with its own staff, policies, procedures, and supervisory responsibilities.” | DOC-012 (decoded) | **EXACT MATCH** |
| “You indicated… the behavior in question has occurred exclusively during the aftercare program, which places it within JCPRD’s authority.” | DOC-012 | **MINOR DIFFERENCE** — full sentence begins “You indicated **in your message** that the behavior…”. Package uses ellipsis; substance matches. |
| “met with and handled” (Angle 5 / DOC-019) | DOC-019 | **EXACT MATCH** — “I am not a parent to be "met with and handled".” |

**Key Quotes table “Verification Status” column:** Marks Leigh White line “Verified” while substituting redaction—**accurate if described as verified *after redaction***; raw email contains the minor’s first name.

---

## 5. Legal Citation Validation

Cross-checked against `legal-research-memo.md`.

| Media package reference | Memo status | Proposition supported? | Issue |
|-------------------------|-------------|-------------------------|--------|
| K.S.A. 72-6114 | **VERIFIED** | Location-based grounds quoted; no clock limit in cited subsections | **None.** Package correctly frames Q1 as legal question + “plain language.” Parent email **does** paraphrase statute as “regardless of the time of day”—**statute text** uses location phrasing, not those exact words (parent argument, not memo error). |
| K.S.A. 72-6147 | **VERIFIED** | “On … school property” etc. | **None.** |
| K.S.A. 75-6104(a)(15) | **PARTIALLY VERIFIED** | Immunity text verified; **no** statutory fee-based childcare carve-out | Package §6 **includes caveat**—**correct.** |
| KORA 45-215, 45-217, 45-218(d) | **VERIFIED** | Short title, definitions, 3 business days | **None.** JCPRD entity caveat reflected. |
| K.A.R. 28-4-420, 28-4-115a, 28-4-114, 28-4-133 | **VERIFIED** (114: tables not reproduced) | Supervision, outdoor rule for **under five**, critical incident reporting | **None** for memo alignment. **Note:** victim is **6**; **28-4-115a(d)(1)** outdoor proximity/sight rule quoted applies to **under five**—Angle 2 narrative ties “younger children” to regulation; **could over-imply** direct regulatory coverage for a six-year-old without counsel framing. |
| 29 U.S.C. § 794 | **PARTIALLY VERIFIED** | Discrimination bar verified; **written parental request → evaluation** not in §794 text | Package §6 **states caveat**—**correct.** |
| 34 C.F.R. §§ 104.32, 104.35, 104.36, 104.37(b) | **VERIFIED** | As summarized | **None.** |
| 42 U.S.C. § 12102 | **VERIFIED** | ADAAA excerpts | **None.** |
| *Nero v. Kansas State University* | **PARTIALLY VERIFIED** | Memo: secondary summaries; “non-delegable duty” phrase **not** confirmed from primary | Package **includes caveat** (“VERIFY WITH COUNSEL”)—**correct.** |
| *Zaragoza v. Board of Johnson County Comm’rs* | **PARTIALLY VERIFIED** | Revisor annotation | Package labeled **annotation reference**—**correct.** |
| *Beshears* / USD 305 | **COULD NOT VERIFY** (memo) | — | **Correctly omitted** from §6 per package disclaimer. |

**Conclusion:** No instance found where the media package treats a **COULD NOT VERIFY** memo item as **VERIFIED** without disclaimer. **PARTIALLY VERIFIED** items generally carry **caveats** where used in §6.

---

## 6. Source Attribution Audit

- **Approximate count of `[SOURCE: …]` tags:** **90** occurrences in `media-briefing-package.md` (grep count; some lines contain multiple tags).
- **DOC-IDs referenced:** DOC-001 through DOC-027 appear in the appendix registry; all **exist** in `evidence-catalog.md`.

**Representative unsourced or weakly sourced content (no `[SOURCE:]` on the same sentence/element):**

1. Package title block / “Prepared for” / methodology line (procedural metadata).
2. Fact sheet **title line** inside the code fence (“FACT SHEET: Institutional Failures…”)—no tag.
3. Multiple **“Why it matters”** sentences under Story Angles—interpretive; not sourced.
4. **Key question 1** — blends **legal memo** with reporter question; not a single DOC tag on the full line (acceptable if read as legal + question).
5. **Key question 5** — explicitly analytical.
6. Section **§6** introductory paragraph (“Only VERIFIED…”)—meta to memo; no DOC-ID.
7. **§7 Document Index** “What it shows” column—editorial summaries without per-row tags.
8. **§8 Talking points** — all have `[SOURCE:]` ✓
9. **§9 Off-Limits** — cites SKILL.md for one row; remainder is policy guidance.

**DOC-ID integrity:** No **phantom** DOC-IDs detected; DOC-027 included in appendix (matches catalog).

---

## 7. Safety Check (Off-Limits §9)

| Rule | Finding |
|------|---------|
| **Minor names** | **FAIL if reporter-facing as-is:** §10 appendix lists filenames **`Formal Grievance_ Safety Incident_Battery regarding Liam Crowley (Mize Elementary).eml`** and **`Liam Crowley Absence 4_6 thru 4_10 (1).eml`**, which **contain the victim’s full name**. Body text largely uses “kindergartener” / redacted quote placeholders—**good**—but **appendix paths break the rule.** |
| **Police investigation beyond case #** | **PASS** — only **#2601522** appears at summary level; no detective narrative. |
| **Attorney communications / strategy** | **PASS** for third-party privileged material — package quotes **parent’s own** email re pending “lawsuit for equitable relief” (DOC-025). **Counsel should still approve** on-the-record use. |
| **Medical records beyond severity** | **PASS at high level** — mechanism, monitoring, Tier 1, DCF/police as **parent-reported**; no chart numbers or imaging. |
| **Content excluded per §9 table** | No raw medical records, no PD witness names, no privileged memos detected in main body. |

---

## 8. Issues and Recommendations (by severity)

### CRITICAL

1. **Minor’s full name in appendix filenames (§10)**  
   - **What’s wrong:** Off-limits §9 forbids sharing victim’s name; appendix exposes **“Liam Crowley”** in two `.eml` path strings.  
   - **Where:** `media-briefing-package.md` §10 table, Location column.  
   - **Fix:** Replace with **neutral paths** (e.g. `formal-grievance-mize-thread.eml`, `absence-notice-2026-04-05-thread.eml`) or redact the filename in any **reporter** copy; keep real names only in **internal** counsel copies.

### IMPORTANT

2. **DOC-003 cited for “high-impact” / “high-impact force” language that appears in DOC-006**  
   - **What’s wrong:** **Media:** attributes combined injury severity (including “high-impact … back/spine”) to **DOC-003** in executive summary and fact sheet. **Source:** “high-impact strike to his back” and “literal risk of spinal paralysis” appear in **DOC-006** (Apr 8 grievance). **DOC-003** (Apr 7) states near-miss paralysis framing and Tier 1 trauma center if spinal inflammation progresses.  
   - **Fix:** Cite **DOC-003 and DOC-006** together for the full severity narrative, or narrow DOC-003 claims to what that email actually says.

3. **Form quotes (DOC-016) without native DOC-020 verification**  
   - **What’s wrong:** Credibility risk if JCPRD PDF wording differs slightly.  
   - **Fix:** Keep **explicit disclaimer** in reporter materials (package already notes obtain DOC-020); consider quoting as **“parent’s characterization / quotation of form.”**

4. **KDHE Critical Incident Report**  
   - **What’s wrong:** Reliance on **district official’s email** (DOC-012), not KDHE’s own record.  
   - **Fix:** Label as **“district represented that JCPRD filed…”** unless/until KDHE record is obtained.

### MINOR

5. **Leigh White quote table “Verified”** — Clarify “verified **with redaction**” vs raw email.  
6. **K.A.R. 28-4-115a** in Angle 2 — Clarify **under-five** outdoor proximity rule vs age of victim (6) to avoid overbroad regulatory implication.  
7. **2025-07-07 lease approval** — Timeline row is **reasonable** but **PDF not verified** in workspace; keep “per attachment metadata / counsel verification” language.  
8. **“JCPRD manager”** (timeline)—**unnamed** in source; optional hedge: “per parent, JCPRD manager.”

---

## 9. Base64 / Extraction Notes

- **`JCPRD at Mize Elementary.eml`:** Primary human-readable bodies for **DOC-012, DOC-013, DOC-014** are **base64-encoded** `text/plain` / `text/html`. Validation used **decoded `text/plain`** for Cater quotes and bullets. **HTML part** not fully decoded—redundant for quoted phrases verified in plain text.  
- **PDFs (DOC-020 incident form, DOC-021 lease, DOC-026/027):** **Not** text-extracted in this validation pass; factual claims about **exact** lease or form wording rely on **parent email transcriptions** where noted.

---

## Validator sign-off

**File written:** `c:\Users\willi\Desktop\VStudio\Liams Revenge\deliverables\validation-report.md`

**Summary for parent agent**

| Item | Value |
|------|--------|
| **Overall confidence** | **MEDIUM** |
| **Issues** | **CRITICAL: 1** · **IMPORTANT: 3** · **MINOR: 4** |
| **Top 3 findings** | (1) Appendix filenames expose **minor’s full name**—fix before reporter share. (2) **High-impact / spinal paralysis** phrasing is **DOC-006**, not DOC-003—correct citations. (3) **Incident form** quotes remain **parent-mediated** until **DOC-020** native file is compared. |
