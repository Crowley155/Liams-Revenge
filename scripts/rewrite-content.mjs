import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, "..", "data", "case-data.json");
const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

// ── 1. Contradiction impacts ────────────────────────────────────────
const impactRewrites = {
  "C-1":
    "JCPRD listed 'Staff' and a specific teacher as witnesses on the official report — but that same teacher admitted she only saw the tail end of what happened. If the only named witnesses didn't actually see the attack, the entire report is built on secondhand information.",
  "C-2":
    "JCPRD checked a box saying 'no medical treatment was necessary.' In reality, Liam's pediatrician ordered seven days of close monitoring, filed a mandatory report with the state child-protection agency (DCF), and warned that if spinal swelling worsened he'd need a Level 1 trauma center. That's not 'no medical treatment.'",
  "C-3":
    "JCPRD's report calls the attack an accidental fall. Liam described it as an intentional 'elbow drop' — a 9-year-old deliberately landing his full body weight on a 6-year-old. Whether this was an accident or deliberate changes everything about discipline, legal exposure, and whether police should be involved.",
  "C-4":
    "USD 232 told the parent their responsibility ends at 3:45 PM. But the district's own anti-bullying policy (JDDC) says it applies 'on school property' — no time limit. Kansas law (K.S.A. 72-6114) uses the same location-based language. The district's own rules contradict what they told this family.",
  "C-5":
    "Alvie Cater wrote that JCPRD 'operates independently, with its own staff, policies, procedures.' But the lease the district signed with JCPRD — Section 8(d) — says the opposite: JCPRD 'will abide by all rules, regulations, and policies adopted by the Board of Education.' The district's own contract contradicts the independence claim.",
  "C-6":
    "The parent sent a written email requesting a 504 evaluation. The school counselor later sent a follow-up email saying the parent chose not to pursue it — based on a phone call, not the written request. A formal written request was effectively closed through an undocumented phone conversation.",
  "C-7":
    "The school counselor verbally described 504 protections as only for kids with medical disabilities. The actual 504 fact sheet she sent may tell a different story — but the document hasn't been fully extracted yet, so we can't confirm whether the parent was given accurate information.",
  "C-8":
    "Alvie Cater pulled one sentence from the parent's email — 'occurred exclusively during the aftercare program' — and used it to argue the district had no jurisdiction. But the parent's full message also explained that a 6-year-old can't tell the difference between school and aftercare, and that the district should act regardless. Cater cherry-picked the sentence that helped the district dodge responsibility.",
  "C-9":
    "Alvie Cater told the parent that JCPRD 'offered to meet' and the parent 'declined.' The parent did decline — but only because JCPRD refused to correct an incident report the parent had documented as inaccurate. The district framed this as the parent being uncooperative, when the parent was asking for basic accountability first.",
  "C-10":
    "Alvie Cater scheduled a meeting with the parent for Monday at 1:00 PM. Less than 48 hours later — the morning after the parent cited the lease agreement — Cater cancelled the meeting, saying 'it sounds like we are not aligned.' The district shut down its own resolution process the moment the parent invoked the contract.",
  "C-11":
    "Brian Schwanz, USD 232's Chief of Operations, wrote a memo to the school board calling JCPRD's programs 'invaluable to our families that need childcare.' But when the parent raised safety concerns, the district's position flipped to 'JCPRD is a separate entity.' You can't call a program invaluable family childcare when pitching it to the board, then call it an independent outside organization when something goes wrong.",
  "C-12":
    "JCPRD's own published handbook says 'our programs function independently in both policy and procedure. We are guests of the school.' But the lease they signed — Section 8(d) — says they must follow all school board policies. JCPRD publicly admits in writing that they don't follow the rules their contract requires. This is the strongest evidence of breach of contract.",
  "C-13":
    "In Fall 2025, USD 232 staff wrote that kindergarten recess policy prevents mixing age groups and provides 3-4 adult supervisors. Six months later, a 9-year-old attacked Liam on the same school playground during a JCPRD program with five staff and zero witnesses. The written safety assurances the school gave the family did not match what actually happened.",
};

for (const c of data.contradictions) {
  if (impactRewrites[c.id]) c.impact = impactRewrites[c.id];
}

// ── 2. Timeline action rewrites ─────────────────────────────────────
const actionRewrites = {
  "T-00":
    "Brian Schwanz, USD 232's Chief of Operations, sends a memo to the school board describing JCPRD's before-and-after-school program as 'invaluable to our families' and asks the board to approve the rental contract on its consent agenda.",
  "T-01":
    "USD 232's Board of Education approves the JCPRD lease agreement for the 2025-26 school year, including Section 8(d) requiring JCPRD to follow all school board policies.",
  "T-01b":
    "BreAnna Burks (kindergarten staff) emails the parent: school policy does not mix age groups at recess; kindergartners stay on the green turf; there are typically 3-4 adult supervisors. She routes JCPRD concerns to the principal and Leigh White.",
  "T-01c":
    "Parent replies to Burks: based on those policies, what Liam described should not have been possible. He asks whether the policy is always followed and notes the same third graders are involved in both the recess and JCPRD incidents.",
  "T-01d":
    "Parent follows up: Liam called the recess and JCPRD incidents 'pranks.' Parent distinguishes imagination from dishonesty, thanks Leigh White for helping investigate, and commits to working with Liam on consequences.",
  "T-02":
    "A 9-year-old physically attacks Liam (age 6) on the Mize Elementary playground during the JCPRD aftercare program. Five JCPRD staff are outside. None of them witness the assault.",
  "T-03":
    "Leigh White (JCPRD site coordinator) sends the first response: says safety is a 'top priority,' the situation was 'handled,' staff have extensive training, and writes 'I am sorry you feel [child] is being harmed' — framing a documented battery as a matter of parental perception.",
  "T-04":
    "Parent fires back: this isn't a 'feeling' — JCPRD's own staff confirmed the battery. Liam's pediatrician has filed a DCF report. Parent announces plans to file a police report and a formal complaint with JCCL because JCPRD offered no details and no safety plan.",
  "T-05":
    "Parent files a report with the Shawnee Police Department. Case number: #2601522.",
  "T-06":
    "Parent emails Liam's teachers: Liam will be absent for the week on pediatrician's orders for close monitoring. Parent shares that DCF and police reports have been filed and that Liam will not return to JCPRD OST.",
  "T-07":
    "JCPRD manager calls the parent by phone and offers a copy of the finalized incident report.",
  "T-08":
    "Amy Branson (JCPRD staff) emails the parent the JCPRD incident form along with a refund notice.",
  "T-09":
    "Parent sends a detailed written rebuttal of the JCPRD incident report, pointing out: the report is based on hearsay, the witness list includes people who didn't see what happened, 'no medical treatment necessary' contradicts the pediatrician's assessment, the report calls the attack 'accidental' when Liam describes an intentional elbow drop, and the children were questioned together in the same room.",
  "T-10":
    "Jennifer Anderson (JCPRD Children's Services Manager) responds: the report was written the day of the incident; KDHE and licensing were notified when the parent mentioned medical care. She offers to meet.",
  "T-11":
    "Parent declines a meeting with JCPRD unless they first correct the incident report to reflect accurate facts.",
  "T-12":
    "Principal Balthazor emails about car loop logistics for picking up and dropping off Liam.",
  "T-13":
    "Parent sends a detailed safety email to school staff: five JCPRD staff were outside and none witnessed the assault; the pediatrician warned of near-miss spinal injury requiring a Level 1 trauma center if inflammation progressed; JCPRD won't remove the older student; parent demands a district investigation and requests 504 protections.",
  "T-14":
    "Principal Balthazor responds: JCPRD is a 'separate entity' that leases space and is not managed by the district after hours. She offers a school-day safety plan and 504 guidance, but declines jurisdiction over the aftercare incident.",
  "T-15":
    "Parent asks directly: is the district refusing to investigate? He confirms his prior email was a formal written request for a 504 evaluation.",
  "T-16":
    "Principal Balthazor routes the parent to Alvie Cater (Deputy Chief of Staff) for the incident inquiry and Janine Winters (school counselor) for the 504 process.",
  "T-17":
    "Parent sends a formal grievance letter to Alvie Cater, citing: the battery on school property, USD 232's anti-bullying policy, Kansas statute K.S.A. 72-6114, the lease agreement's constructive-possession implications, and documented prior notice of problems.",
  "T-18":
    "Alvie Cater responds and proposes an in-person meeting for Monday, April 13 at 1:00 PM at the district office in De Soto.",
  "T-19":
    "Parent accepts the meeting and sets expectations. He explains that Liam can't distinguish between JCPRD and the school day, notes the incidents occurred 'exclusively during the aftercare program,' and highlights that five staff were present yet none witnessed the assault.",
  "T-20":
    "Parent emails all school staff: quotes Lease Section 8(d) requiring JCPRD to follow board policies, raises fire-code concerns about mixing kindergartners with older children, describes the physical vulnerability of a 6-year-old's 'size and limited motor skills,' and demands the district investigate.",
  "T-21":
    "School counselor Janine Winters calls the parent by phone. The content of this call is not transcribed in any emails.",
  "T-22":
    "Janine Winters sends a follow-up email: attaches a 504 fact sheet and a counseling permission slip, and writes 'as I understood during our conversation, this is not the avenue you would like to move forward with at this time' — memorializing the parent's alleged 504 withdrawal based on the phone call.",
  "T-23":
    "Alvie Cater sends his detailed position: JCPRD operates independently with its own staff and policies; uses the parent's 'exclusively aftercare' language to argue it falls under JCPRD jurisdiction; lists JCPRD's KDHE critical incident steps; and states the parent 'declined' JCPRD's meeting offer.",
  "T-24":
    "Parent replies immediately: quotes Lease Section 8(d) word-for-word, explains he declined the JCPRD meeting because they refused to fix the inaccurate report, and asks whether any other agreement supersedes the lease obligations.",
  "T-25":
    "Parent forwards the full Leigh White / JCPRD email chain to Alvie Cater to provide complete documentation of the JCPRD interactions.",
  "T-26":
    "Parent sends his final email to Jennifer Anderson (JCPRD): closes the administrative channel, demands they amend the inaccurate report, conduct a proper investigation, and implement structural safety fixes. He attaches the full lease PDF.",
  "T-27":
    "Alvie Cater cancels the Monday meeting — the morning after the parent cited the lease. He writes: 'It sounds like we are not aligned on this.' He redirects the parent to JCPRD and KDHE, effectively shutting down the district's administrative resolution process.",
  "T-28":
    "Parent responds to Janine Winters: no one-on-one counselor sessions with Liam without a parent present; the family will use private providers. He discloses a pending lawsuit seeking equitable relief.",
};

for (const t of data.timeline) {
  if (actionRewrites[t.id]) t.action = actionRewrites[t.id];
}

// ── 3. Claims — add plainSummary ────────────────────────────────────
const plainSummaries = {
  "CLAIM-1":
    "The school district owns the building where Liam was attacked. When you let someone use your property, you have a legal duty to make sure they're not hurting people — especially when you already knew about problems and did nothing. The challenge: Kansas has a law that protects government agencies from lawsuits when injuries happen on playgrounds, unless the negligence was extreme.",
  "CLAIM-2":
    "JCPRD had five staff members outside and none of them saw a 9-year-old attack a 6-year-old. Kansas childcare regulations require staff to know where every child is and what they're doing at all times. Five adults were present. Zero witnessed the assault. That's a supervision failure.",
  "CLAIM-3":
    "USD 232 has the power through the lease to force JCPRD to follow school rules. They chose not to use that power. When a landlord knows their tenant is creating dangerous conditions and does nothing, the landlord shares responsibility.",
  "CLAIM-4":
    "Kansas has childcare licensing rules (KDHE) that require active supervision and timely incident reporting. Filing a complaint with the state licensing agency creates pressure even though it doesn't directly lead to a lawsuit — it creates an official government record of the failure.",
  "CLAIM-5":
    "JCPRD's incident report contains statements that are contradicted by medical evidence and the teacher's own admissions. If the official report is misleading, any investigation or decision based on that report is built on bad information.",
  "CLAIM-6":
    "If JCPRD's staff weren't properly trained to supervise mixed-age groups on a playground, that's an organizational failure at the hiring and training level. This claim requires getting JCPRD's training records through discovery.",
  "CLAIM-7":
    "This is the strongest legal argument. The lease between USD 232 and JCPRD — Section 8(d) — requires JCPRD to follow every school board policy, including the anti-bullying policy. JCPRD's own handbook admits they operate 'independently in both policy and procedure.' That's a written confession of contract violation. And contract claims bypass the immunity protections that would normally shield government agencies from lawsuits.",
};

for (const c of data.claims) {
  if (plainSummaries[c.id]) c.plainSummary = plainSummaries[c.id];
}

// ── 4. Source relevance rewrites + keyQuote ──────────────────────────
const sourceRewrites = {
  "AUTH-01": {
    relevance:
      "This Kansas statute says students can be suspended or expelled for dangerous behavior 'at school, on school property, or at a school supervised activity.' It doesn't say 'only during school hours.' USD 232 told the parent their responsibility ends at 3:45 — their own state law says otherwise.",
    keyQuote:
      "'at school, on school property, or at a school supervised activity'",
  },
  "AUTH-02": {
    relevance:
      "This is the Kansas law that requires every school district to have an anti-bullying policy covering behavior 'on school property.' USD 232's policy (JDDC) is based on this statute. Under Lease Section 8(d), JCPRD is required to follow it. They didn't.",
    keyQuote: null,
  },
  "AUTH-03": {
    relevance:
      "This is the immunity defense JCPRD and USD 232 will use. Kansas law shields government agencies from lawsuits when injuries happen on property 'intended or permitted for use as a park, playground, or open area for recreation' — unless the negligence rises to 'gross and wanton.' This is the main legal obstacle for the tort claims. The contract claim bypasses it entirely.",
    keyQuote:
      "'intended or permitted for use as a park, playground, or open area for recreational purposes'",
  },
  "AUTH-04": {
    relevance:
      "The clock is running. The family has two years from the date of the assault (April 2, 2026) to file a tort lawsuit — deadline is April 2, 2028.",
    keyQuote: null,
  },
  "AUTH-05": {
    relevance:
      "Kansas Open Records Act. This is the tool for requesting documents from USD 232 and JCPRD — training records, prior incident reports, staff logs, internal communications. Both are government entities required to comply.",
    keyQuote: null,
  },
  "AUTH-06": {
    relevance:
      "Defines what counts as a 'public agency' and 'public record' under Kansas open records law. USD 232 clearly qualifies. JCPRD, as a county government entity, almost certainly qualifies too — confirm with counsel.",
    keyQuote: null,
  },
  "AUTH-07": {
    relevance:
      "Agencies must respond to open records requests within 3 business days. This creates a tight, enforceable timeline for getting documents from USD 232 and JCPRD.",
    keyQuote: null,
  },
  "AUTH-08": {
    relevance:
      "Defines what counts as a 'child care center' under Kansas law: any facility providing care for three or more children for more than three hours per day. JCPRD's before-and-after-school program fits this definition, which means KDHE childcare regulations apply to them.",
    keyQuote: null,
  },
  "AUTH-09": {
    relevance:
      "Kansas childcare regulation requiring staff to know where every child is and what they're doing. For kids under 5, staff must keep them within sight and close proximity. JCPRD had five staff outside and none of them witnessed a 9-year-old attacking a 6-year-old. That's a potential violation of this regulation.",
    keyQuote:
      "'providers must be aware of and responsible for the ongoing activity of each child'",
  },
  "AUTH-10": {
    relevance:
      "Sets the required staff-to-child ratios for Kansas childcare facilities. Relevant for analyzing whether JCPRD had enough staff for the number of children on the playground.",
    keyQuote: null,
  },
  "AUTH-11": {
    relevance:
      "Requires childcare facilities to notify parents immediately after a critical incident and file a written report with KDHE by the next business day. JCPRD's manager said they reported to KDHE only after the parent mentioned seeking medical care — raising questions about whether they would have reported at all.",
    keyQuote: null,
  },
  "AUTH-12": {
    relevance:
      "Legal framework for when a property owner has a duty to protect visitors from harm caused by other people on the property. Referenced in the key Kansas case (Nero) about government landlord responsibility.",
    keyQuote: null,
  },
  "AUTH-13": {
    relevance:
      "The key Kansas Supreme Court case establishing that a government property owner (like USD 232) owes reasonable care to people on its property when harm from third parties is foreseeable. The parent documented prior concerns — making the April 2026 attack foreseeable.",
    keyQuote:
      "'a governmental landowner owes a duty of reasonable care; foreseeability of third-party harm is often a question of fact'",
  },
  "AUTH-14": {
    relevance:
      "A case the defense will cite — but it's distinguishable. That case involved an off-campus, voluntary fight between older students. This case involves a 6-year-old attacked on school property during a supervised program with documented prior notice.",
    keyQuote: null,
  },
  "AUTH-15": {
    relevance:
      "Kansas Supreme Court case establishing that if a school had prior notice of a risk and didn't act, that supports a finding of foreseeability. The parent sent multiple emails warning about safety problems before the April 2026 attack.",
    keyQuote: null,
  },
  "AUTH-16": {
    relevance: "Defense case on limits of school liability. Distinguishable but will be cited by opposing counsel.",
    keyQuote: null,
  },
  "AUTH-17": {
    relevance: "Cited through the Beshears case for general duty limitations. Defense will reference it.",
    keyQuote: null,
  },
  "AUTH-18": {
    relevance: "Premises liability framework case quoted in the Nero decision. Establishes the property-owner duty analysis.",
    keyQuote: null,
  },
  "AUTH-19": {
    relevance:
      "This Kansas case defines who can sue under a contract they didn't personally sign. The key question: were students the 'intended' beneficiaries of Lease Section 8(d), which requires JCPRD to follow school safety policies? If yes, the parent can bring a breach-of-contract claim on Liam's behalf.",
    keyQuote:
      "'must be intended, not incidental; need not be personally named; burden on claimant'",
  },
  "AUTH-20": {
    relevance:
      "Establishes that an unnamed class of people (like 'students') can be intended third-party beneficiaries of a contract. Supports the argument that students are the intended beneficiaries of the lease's safety requirements.",
    keyQuote: null,
  },
  "AUTH-21": {
    relevance:
      "Core Kansas immunity case about school gym activities. But it also adopted the 'more than incidental' test from Illinois — which is actually the foundation for arguing that JCPRD's program is educational, not purely recreational, and therefore immunity shouldn't apply.",
    keyQuote: null,
  },
  "AUTH-22": {
    relevance:
      "Kansas case holding that just because an activity is supervised doesn't mean recreational immunity goes away. Supervision alone isn't enough to defeat the immunity defense.",
    keyQuote: null,
  },
  "AUTH-23": {
    relevance: "Extends recreational immunity to indoor school spaces like wrestling rooms. Follows the Jackson decision.",
    keyQuote: null,
  },
  "AUTH-24": {
    relevance: "Even coach-supervised football falls under recreational immunity. Shows how broadly Kansas courts apply the immunity shield.",
    keyQuote: null,
  },
  "AUTH-25": {
    relevance:
      "Important Kansas Supreme Court case: the 'primary purpose' of a facility isn't what matters for immunity — you have to look at whether recreation was 'more than incidental' to the actual use. This cuts both ways depending on how JCPRD's program is characterized.",
    keyQuote: null,
  },
  "AUTH-26": {
    relevance:
      "Recent 2024 Johnson County case reading recreational immunity broadly. This is the most defense-favorable recent precedent in the exact same county where this case would be tried.",
    keyQuote: null,
  },
  "AUTH-27": {
    relevance:
      "A plaintiff-friendly exception: immunity doesn't apply if the injury happened in a part of the property that wasn't integral to recreational use. If the specific playground area serves the educational aftercare program, this could help.",
    keyQuote: null,
  },
  "AUTH-28": {
    relevance:
      "Defines what 'gross and wanton negligence' means in Kansas — the threshold needed to overcome recreational immunity. Five staff present with zero witnesses could meet this bar.",
    keyQuote: null,
  },
  "AUTH-29": {
    relevance: "Defense will cite this for summary judgment on the gross/wanton negligence standard.",
    keyQuote: null,
  },
  "AUTH-30": {
    relevance: "Addresses gross/wanton negligence specifically in a public park context — directly relevant to a playground injury case.",
    keyQuote: null,
  },
  "AUTH-31": {
    relevance: "Another gross/wanton negligence standard case in the public park context.",
    keyQuote: null,
  },
  "AUTH-32": {
    relevance:
      "Favorable case: Kansas court held that gross/wanton negligence can be a factual question that prevents the case from being thrown out on summary judgment. Supports keeping the case alive past early motions.",
    keyQuote: null,
  },
  "AUTH-33": {
    relevance:
      "Caution: just because JCPRD violated a regulation doesn't automatically mean they're legally negligent. You still have to prove the violation caused the harm. The regulatory claim supports the story but doesn't win the lawsuit by itself.",
    keyQuote: null,
  },
  "AUTH-34": {
    relevance:
      "Critical Kansas Supreme Court case: when a government entity enters a contract, it has the same obligations as any private business. This means the breach-of-contract claim against JCPRD for violating Lease Section 8(d) is NOT subject to government immunity protections.",
    keyQuote:
      "'government contractual obligations — same responsibilities as private entity in business transactions'",
  },
  "AUTH-35": {
    relevance: "Framework case for determining intended vs. incidental third-party beneficiary status, cited through the Kincaid decision.",
    keyQuote: null,
  },
  "AUTH-36": {
    relevance: "Places the burden on the person claiming third-party beneficiary status. The family will need to prove students were intended beneficiaries of Lease Section 8(d).",
    keyQuote: null,
  },
  "AUTH-37": {
    relevance: "Same as AUTH-20. Supports unnamed classes (like students) as intended beneficiaries.",
    keyQuote: null,
  },
  "AUTH-38": {
    relevance:
      "Kansas case analyzing whether specific parts of a school building (like a commons area next to a gym) are 'integral' to recreational use for immunity purposes. Relevant to how the playground is characterized.",
    keyQuote: null,
  },
  "AUTH-39": {
    relevance:
      "Strongest persuasive authority for the educational-purpose argument. Illinois court held that a school cafeteria used for an after-school event was NOT recreational — even during non-school hours — because the space's primary purpose was educational. This directly supports arguing that JCPRD's after-school program is educational, not recreational.",
    keyQuote:
      "'Cafetorium with educational uses NOT intended for recreation even during after-school event'",
  },
  "AUTH-40": {
    relevance:
      "The foundational case that created the 'instruction vs. amusement' test and the 'more than incidental' recreational use standard. Kansas adopted this test in Jackson. It's the basis for arguing JCPRD's program has an educational purpose that goes beyond pure recreation.",
    keyQuote: null,
  },
  "AUTH-41": {
    relevance:
      "JCPRD's own published handbook for its Olathe programs. Policy 1 states: 'programs function independently in both policy and procedure.' This is an institutional admission — in writing, published publicly — that JCPRD does not follow the school board policies the lease requires. It also describes the program's educational mission throughout, which undermines the 'purely recreational' characterization.",
    keyQuote:
      "'Our programs function independently in both policy and procedure. We are guests of the school.'",
  },
  "AUTH-42": {
    relevance:
      "Kansas UCC statute allowing personal injury damages for breach of warranty. It applies to goods sales, not services — so using it for a lease/services contract is legally uncertain. Needs counsel evaluation.",
    keyQuote: null,
  },
  "AUTH-43": {
    relevance:
      "Brian Schwanz's memo to the USD 232 Board of Education requesting approval of the JCPRD rental contract. He describes JCPRD as providing 'invaluable' childcare. This destroys the 'separate entity' defense: the district's own Chief of Operations presented JCPRD's program to the board as integrated family childcare, not an independent outside organization.",
    keyQuote:
      "'The programs JCPRD provides are invaluable to some of our families that need childcare during the summer and before and after school.'",
  },
};

for (const s of data.sources) {
  const rw = sourceRewrites[s.id];
  if (rw) {
    s.relevance = rw.relevance;
    if (rw.keyQuote) s.keyQuote = rw.keyQuote;
  }
}

// ── 5. Actor bios ───────────────────────────────────────────────────
const bios = {
  "will-crowley":
    "Liam's father. After the assault, he filed reports with police, DCF, and the school, then systematically documented every institutional failure through emails, citing the lease agreement, state law, and district policy. He's the one who found the contract clause (Section 8d) that neither the school nor JCPRD acknowledged.",
  "gerri-balthazor":
    "The principal of Mize Elementary. When the parent reported the assault, she was the first to use the 'separate entity' language about JCPRD, directing the parent away from the school. She offered a school-day safety plan but declined to address anything that happened during aftercare hours.",
  "alvie-cater":
    "USD 232's Deputy Chief of Staff and Communications. He initially scheduled a meeting with the parent, then cancelled it within 48 hours — the morning after the parent quoted the lease agreement. He cherry-picked the parent's 'exclusively during aftercare' language to build a jurisdictional argument that the school had no responsibility.",
  "janine-winters":
    "Mize Elementary's school counselor. She had a phone call with the parent about 504 protections, then sent a follow-up email memorializing the parent's alleged choice not to pursue it — effectively closing a formal written request through an undocumented phone conversation.",
  "leigh-white":
    "JCPRD's on-site coordinator at Mize Elementary. She sent the first response after the assault, framing a documented battery as 'I am sorry you feel [child] is being harmed.' She also helped investigate the earlier Fall 2025 incidents and is thanked by the parent in that thread.",
  "jennifer-anderson":
    "JCPRD's Children's Services Manager. She confirmed the incident report was written the same day as the assault and that KDHE was only notified after the parent mentioned seeking medical care — suggesting the regulatory report might not have been filed otherwise.",
  "amy-branson":
    "JCPRD staff member who sent the official incident form and refund notice to the parent. Limited direct involvement in the substantive dispute.",
  "brian-schwanz":
    "USD 232's Chief of Operations. He wrote the memo to the school board calling JCPRD's programs 'invaluable to our families that need childcare.' This is the same program the district later called a 'separate entity' when a child was hurt. His memo is key evidence that the district viewed JCPRD as integrated family services, not an independent outside organization.",
  "breanna-burks":
    "Kindergarten staff at Mize Elementary. In September 2025, she provided written confirmation that the school's recess policy prevents mixing age groups and that 3-4 adults supervise kindergartners. These assurances were contradicted by the April 2026 assault on the same property.",
};

for (const a of data.actors) {
  if (bios[a.id]) a.bio = bios[a.id];
}

// ── Write ───────────────────────────────────────────────────────────
writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log("✓ All content rewrites applied to case-data.json");
