import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, "..", "data", "case-data.json");
const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

const newSources = [
  {
    id: "AUTH-50",
    citation: "K.S.A. 72-3239",
    type: "statute",
    holding:
      "Authorizes school districts to establish, operate, and maintain 'extraordinary school programs' — defined as programs operated before or after regular school hours during the regular school term for purposes including enrichment, remedial instruction, higher-order thinking skills, and special enrichment projects",
    verification: "VERIFIED",
    relevance:
      "This is the statute that defines what JCPRD's OST program actually is under Kansas law: an extraordinary school program. The statutory definition matches OST exactly — operated before/after school hours, maintained for enrichment, strengthening skills, and 'special projects and activities designed to enrich and enhance the educational experience of pupils.' This is not a recreational program. Kansas law itself classifies it as educational. The district authorized JCPRD to operate this program, which means the district has statutory responsibility for it — not just contractual.",
    url: "https://ksrevisor.gov/statutes/chapters/ch72/072_032_0039.html",
    keyQuote:
      "An 'extraordinary school program' means a program which is established by the board of education of a school district, operated before or after regular school hours during the regular school term, and maintained for any or all of the following purposes: (1) Providing pupils with additional time to achieve learner exit or improvement plan outcomes; (2) giving pupils remedial instruction or independent study assistance; (3) affording pupils an opportunity to strengthen or attain mastery of basic or higher order thinking skills; and (4) conducting special projects and activities designed to enrich and enhance the educational experience of pupils.",
  },
  {
    id: "AUTH-51",
    citation: "K.S.A. 72-1421",
    type: "statute",
    holding:
      "Authorizes school boards to establish, operate, and maintain child care facilities — including by contracting with public or private agencies — and subjects all such facilities to KDHE licensing (article 5 of chapter 65)",
    verification: "VERIFIED",
    relevance:
      "USD 232 contracted with JCPRD for child care under the authority granted by this statute. Subsection (c) is critical: 'Every school district which establishes, operates and maintains a child care facility shall be subject to the provisions contained in article 5 of chapter 65' — that's the KDHE licensing chapter (K.S.A. 65-501 through 65-508). The district didn't just casually lease space. It entered into a statutory arrangement that explicitly binds both parties to KDHE licensing obligations, including the K.S.A. 65-508 duty of care.",
    url: "https://ksrevisor.gov/statutes/chapters/ch72/072_014_0021.html",
    keyQuote:
      "The board of education of any school district may: (1) Establish, operate and maintain a child care facility; (3) contract with private, nonprofit corporations or associations or with any public or private agency or institution... for the establishment, operation and maintenance of a child care facility. (c) Every school district which establishes, operates and maintains a child care facility shall be subject to the provisions contained in article 5 of chapter 65.",
  },
  {
    id: "AUTH-52",
    citation: "K.S.A. 65-527",
    type: "statute",
    holding:
      "Defines 'school-age program' as a child care facility serving exclusively school-age children; establishes licensing framework for such programs operating in schools and public recreation centers",
    verification: "VERIFIED",
    relevance:
      "This statute defines what JCPRD's OST is in KDHE licensing terms: a 'school-age program' — a child care facility operating in a 'school' (defined as 'any building used for instruction of students enrolled in kindergarten or any of the grades one through 12'). Mize Elementary is a school. JCPRD's OST operates in it. This statute confirms JCPRD's program is a licensed child care facility under Kansas law, not just a casual tenant. It cannot operate without KDHE licensure and is subject to all obligations that come with it.",
    url: "https://ksrevisor.gov/statutes/chapters/ch65/065_005_0027.html",
    keyQuote:
      "'School-age program' means a child care facility that serves exclusively school-age children and youth. 'School' means any building used for instruction of students enrolled in kindergarten or any of the grades one through 12 by a school district or an accredited nonpublic school.",
  },
];

data.sources.push(...newSources);

writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(
  `Added ${newSources.length} sources. Total sources: ${data.sources.length}`,
);
newSources.forEach((s) => console.log(`  ${s.id}: ${s.citation}`));
