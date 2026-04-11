import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, "..", "data", "case-data.json");
const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

const newSources = [
  {
    id: "AUTH-44",
    citation: "K.S.A. 65-501",
    type: "statute",
    holding:
      "Unlawful to conduct or maintain a child care facility for children under 16 without a KDHE license or temporary permit",
    verification: "VERIFIED",
    relevance:
      "This is the enabling statute that makes JCPRD's KDHE license legally mandatory — not voluntary. JCPRD prominently advertises being 'fully licensed,' which means they are bound by every obligation that comes with licensure under K.S.A. 65-508. A parent enrolling a child in a licensed program has a right to expect statutory compliance.",
    url: "https://ksrevisor.gov/statutes/chapters/ch65/065_005_0001.html",
    keyQuote:
      "It shall be unlawful for any person, firm, corporation or association to conduct or maintain a maternity center or child care facility... without having a license or temporary permit therefor from the secretary.",
  },
  {
    id: "AUTH-45",
    citation: "K.S.A. 65-508",
    type: "statute",
    holding:
      "Licensed child care facilities must operate 'with strict regard to the health, comfort, safety, and social welfare of children'",
    verification: "VERIFIED",
    relevance:
      "This is the statutory duty of care for JCPRD's licensed program. It is not aspirational — it is a legal obligation attached to the KDHE license JCPRD holds. When five staff are outside and none witness an assault on a six-year-old, that is a failure of the 'strict regard to health, comfort, safety' standard. When the incident report contradicts medical evidence, that is a failure of the 'social welfare' standard.",
    url: "https://ksrevisor.gov/statutes/chapters/ch65/065_005_0008.html",
    keyQuote:
      "Each facility... shall be operated with strict regard to the health, comfort, safety, and social welfare of such children or youth.",
  },
  {
    id: "AUTH-46",
    citation: "K.S.A. 72-1150",
    type: "statute",
    holding:
      "Authorizes school districts to lease land, buildings, and facilities; governs the legal framework for the USD 232-JCPRD lease",
    verification: "VERIFIED",
    relevance:
      "This is the statutory authority under which USD 232 leases space to JCPRD at Mize Elementary. The district chose to enter this lease, chose its terms (including Section 8(d)), and retains the authority to enforce them. The district cannot claim it has 'no oversight' when the lease it voluntarily created includes enforcement mechanisms.",
    url: "https://ksrevisor.gov/statutes/chapters/ch72/072_011_0050.html",
    keyQuote: null,
  },
  {
    id: "AUTH-47",
    citation: "JCPRD OST Program Page (jcprd.com/221)",
    type: "documentary",
    holding:
      "Markets OST as STEM-enrichment, 'safe, enriching, fun place,' 1:15 ratio, bachelor's-degreed directors, fully KDHE licensed; 'enhanced safety, convenience' and 'extend school day learning'",
    verification: "VERIFIED",
    relevance:
      "This is how JCPRD presents itself to parents making enrollment decisions. They promise STEM education, environmental literacy, safety, and qualified staff. They explicitly state: 'a safe, enriching, fun place to be' and that the program provides 'enhanced safety, convenience, and numerous opportunities to extend school day learning experiences.' Parents rely on these representations when entrusting their children to the program.",
    url: "https://www.jcprd.com/221/Out-of-School-Time-OST",
    keyQuote:
      "The availability of this program within your child's school provides enhanced safety, convenience, and numerous opportunities to extend school day learning experiences.",
  },
  {
    id: "AUTH-48",
    citation: "JCPRD OST Registration Page (jcprd.com/1280)",
    type: "documentary",
    holding:
      "Registration organized by school name (e.g., 'OST: Olathe - School Name'), KDHE-required ePACT forms, school-aligned enrollment windows",
    verification: "VERIFIED",
    relevance:
      "The registration process reinforces that this is a school-integrated program, not an independent recreation offering. Parents search by their child's school name. Enrollment windows are aligned to school districts. KDHE forms are required before attendance. A reasonable parent would conclude this program operates under the same safety framework as the school itself.",
    url: "https://www.jcprd.com/1280/OST-Registration",
    keyQuote:
      "Search for your child's school name in the search bar. Click on 'OST: Olathe - School Name (2026-27)'.",
  },
  {
    id: "AUTH-49",
    citation: "JCPRD 'Voted Best After School Care' (jcprd.com/221)",
    type: "documentary",
    holding:
      "Self-promotional badge on OST page claiming 'Voted Best After School Care'",
    verification: "VERIFIED",
    relevance:
      "JCPRD uses this award prominently on their marketing page to build parental trust. The claim positions them as the standard of excellence for after-school care in Johnson County. When the program fails to meet basic supervision standards — five staff outside, zero witnesses to an assault — the gap between marketing and reality becomes evidence of negligent misrepresentation.",
    url: "https://www.jcprd.com/221/Out-of-School-Time-OST",
    keyQuote: "Voted Best After School Care!",
  },
];

data.sources.push(...newSources);

writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(
  `Added ${newSources.length} sources. Total sources: ${data.sources.length}`,
);
newSources.forEach((s) => console.log(`  ${s.id}: ${s.citation}`));
