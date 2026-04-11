import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, "..", "data", "case-data.json");
const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

// Revise AUTH-50 (72-3239) to be more nuanced
const auth50 = data.sources.find((s) => s.id === "AUTH-50");
if (auth50) {
  auth50.holding =
    "Defines 'extraordinary school program' as a before/after-school enrichment program established by the board of education. Kansas law treats this type of programming as educational in character — not recreational.";
  auth50.relevance =
    "JCPRD's marketing matches this statute's definition almost word-for-word: STEM, enrichment, 'extending school day learning.' However, JCPRD's OST does not formally qualify as an extraordinary school program because it was not 'established by the board' and is not staffed by certified teachers. The statute's value is definitional: Kansas law itself categorizes before/after-school enrichment as educational, undermining the defense's 'recreational program' characterization for immunity purposes. Use for the Ozuk/Jackson educational-purpose argument only — not as a direct classification of JCPRD's program.";
  console.log("Revised AUTH-50");
}

// Add new sources
const newSources = [
  {
    id: "AUTH-53",
    citation: "K.S.A. 72-1422",
    type: "statute",
    holding:
      "Authorizes school boards to cooperate with public agency officers managing parks and public grounds 'to provide for the supervision and instruction necessary to carry on such public educational and recreational activities'",
    verification: "VERIFIED",
    relevance:
      "This is the statutory authority for the USD 232-JCPRD partnership. The statute explicitly uses the phrase 'educational and recreational' — the Kansas legislature itself recognized that school-agency partnerships produce hybrid programs, not purely recreational ones. This bridges the childcare classification (72-1421) and the educational character of the program (72-3239), and prevents the defense from forcing a binary choice between 'childcare' and 'recreation.'",
    url: "https://ksrevisor.gov/statutes/chapters/ch72/072_014_0022.html",
    keyQuote:
      "Such board is also authorized to cooperate with the officers having the custody and management of public buildings and public parks and other public grounds in cities, to provide for the supervision and instruction necessary to carry on such public educational and recreational activities.",
  },
  {
    id: "AUTH-54",
    citation: "K.A.R. 28-4-578(b)(1)",
    type: "regulation",
    holding:
      "Exempts 'extraordinary school programs' (K.S.A. 72-3239) from KDHE child care facility licensing — but only if conducted on school premises, attended by enrolled pupils only, and staffed by certified elementary school teachers",
    verification: "VERIFIED",
    relevance:
      "This regulation confirms that true extraordinary school programs are a separate regulatory category from licensed child care. JCPRD's program does NOT qualify for this exemption: JCPRD is not a school district, its staff are not certified teachers, and it serves children from multiple schools. JCPRD chose KDHE licensure as a child care facility. This reinforces that the correct classification is licensed child care under K.S.A. 65-527/72-1421, subject to the K.S.A. 65-508 duty of care — not an exempt educational program.",
    url: "https://sos.ks.gov/publications/pubs_kar_Regs.aspx?KAR=28-4-578",
    keyQuote:
      "An 'extraordinary school program,' as defined in K.S.A. 72-8238, or a similar extended school day program that is conducted on the premises of an accredited non-public school, is attended only by pupils enrolled in the school, and is staffed by certified elementary school teachers [shall not be considered a child care facility].",
  },
];

data.sources.push(...newSources);

writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(
  `Added ${newSources.length} sources. Total: ${data.sources.length}`,
);
newSources.forEach((s) => console.log(`  ${s.id}: ${s.citation}`));
