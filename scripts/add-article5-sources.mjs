import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, '..', 'data', 'case-data.json');
const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

const newSources = [
  {
    id: 'AUTH-55',
    citation: 'K.S.A. 65-503',
    type: 'statute',
    holding:
      'Defines "child care facility," "school-age program," and "day care facility" for purposes of Article 5. A "school-age program" is a child care facility serving exclusively school-age children. This definition anchors JCPRD\'s OST program within the Article 5 regulatory framework.',
    verification: 'VERIFIED',
    relevance:
      'Establishes that JCPRD\'s Out of School Time program is a "school-age program" and therefore a "child care facility" under Article 5. This is the definitional anchor that makes every other Article 5 provision applicable.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0003.html',
    keyQuote:
      '"School-age program" means a child care facility that serves exclusively school-age children and youth but does not include a youth development program.',
  },
  {
    id: 'AUTH-56',
    citation: 'K.S.A. 65-504(d)',
    type: 'statute',
    holding:
      'Authorizes KDHE to revoke a child care facility license when the facility "is maintained without due regard to the health, safety or welfare of any woman or child." Revocation requires notice and hearing under the Kansas Administrative Procedure Act.',
    verification: 'VERIFIED',
    relevance:
      'Under 72-1421(c), USD 232 is subject to this provision. The standard — "maintained without due regard" — is the same language as 65-508 but here it carries a consequence: license revocation. The district\'s child care arrangement is exposed to this enforcement mechanism.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0004.html',
    keyQuote:
      'When the secretary of health and environment finds...that the maternity center or child care facility is maintained without due regard to the health, safety or welfare of any woman or child, the secretary of health and environment may issue an order revoking such license.',
  },
  {
    id: 'AUTH-57',
    citation: 'K.S.A. 65-506',
    type: 'statute',
    holding:
      'Requires KDHE to notify the Department of Education and other agencies of any license limitation, modification, suspension, or revocation. The facility must also notify parents/guardians in writing of any such action.',
    verification: 'VERIFIED',
    relevance:
      'Creates a parent-notification duty. If JCPRD\'s license were limited or modified due to compliance issues, parents must be informed in writing. This section also triggers Department of Education involvement — linking KDHE licensing actions back to the educational system.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0006.html',
    keyQuote:
      'A maternity center or child care facility that has had a license limited, modified, suspended, revoked or denied by the secretary of health and environment shall notify in writing the parents or guardians of the enrollees.',
  },
  {
    id: 'AUTH-58',
    citation: 'K.S.A. 65-507',
    type: 'statute',
    holding:
      'Requires every child care facility licensee to maintain records including "the name and age of each child received and cared for," the attending physician for any sick children, and parent/guardian information.',
    verification: 'VERIFIED',
    relevance:
      'JCPRD Site Coordinator Jennifer Anderson admitted the incident report "does not include later information," meaning it was knowingly incomplete. Under 65-507, the facility is required to maintain records including the name of the physician who attended any sick or injured children. An incomplete or inaccurate incident report may violate this record-keeping requirement.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0007.html',
    keyQuote:
      'Each child care facility licensee shall keep a record...which shall include the name and age of each child received and cared for in the facility; the name of the physician who attended any sick children in the facility, together with the names and addresses of the parents or guardians of such children.',
  },
  {
    id: 'AUTH-59',
    citation: 'K.S.A. 65-512',
    type: 'statute',
    holding:
      'KDHE must inspect every child care facility at least once every 12 months. Critically, KDHE "shall conduct an inspection of any child care facility upon receiving a complaint." The licensee must give all reasonable information and afford every reasonable facility for viewing the premises.',
    verification: 'VERIFIED',
    relevance:
      'After the April 2026 assault, neither JCPRD nor USD 232 appears to have filed a complaint with KDHE, nor informed the parent of their right to trigger a complaint-based inspection. Under 72-1421(c), the district is subject to this inspection regime. A KDHE complaint inspection could evaluate playground supervision, incident reporting, and compliance with 65-508.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0012.html',
    keyQuote:
      'The secretary of health and environment shall conduct an inspection of any child care facility upon receiving a complaint.',
  },
  {
    id: 'AUTH-60',
    citation: 'K.S.A. 65-513',
    type: 'statute',
    holding:
      'When an authorized agent finds a child care facility "not being conducted according to law," the licensee must be notified in writing and has 5 days to make the required changes or alterations.',
    verification: 'VERIFIED',
    relevance:
      'Establishes a 5-day cure period after a finding of non-compliance. This is the enforcement pipeline: complaint (65-512) triggers inspection, inspection triggers written notice (65-513), failure to cure within 5 days triggers penalties (65-514) or license action (65-523/65-524).',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0013.html',
    keyQuote:
      'It shall thereupon be the duty of the licensee to make such changes or alterations as are contained in the written notice within five days from the receipt of such notice.',
  },
  {
    id: 'AUTH-61',
    citation: 'K.S.A. 65-514',
    type: 'statute',
    holding:
      'Any person who violates Article 5 is "guilty of a misdemeanor." Each day of non-compliance is a separate offense ($5–$50 fine per day). After 30 days of continued non-compliance, premises may be closed.',
    verification: 'VERIFIED',
    relevance:
      'Violations of Article 5 carry criminal penalties. Under 72-1421(c), the district is subject to these provisions. Sustained non-compliance — such as failure to maintain adequate supervision standards or incomplete record-keeping — could constitute ongoing daily violations.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0014.html',
    keyQuote:
      'Any person, firm, corporation or association who violates the provisions of article 5 of chapter 65...shall be guilty of a misdemeanor...Each and every day that the person fails or refuses to comply shall be deemed a separate offense.',
  },
  {
    id: 'AUTH-62',
    citation: 'K.S.A. 65-515',
    type: 'statute',
    holding:
      'The county attorney of each county is "authorized and required" to file complaints and prosecute to final determination all Article 5 violations upon complaint from an authorized KDHE agent.',
    verification: 'VERIFIED',
    relevance:
      'Creates a mandatory prosecution mechanism. The Johnson County Attorney is required to prosecute Article 5 violations upon KDHE complaint. This is not discretionary — the statute says "authorized and required."',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0015.html',
    keyQuote:
      'The county attorney of each county in this state is hereby authorized and required, upon complaint of any authorized agent of the secretary of health and environment, to file complaint and prosecute to the final determination all actions or proceedings against any person under the provisions of this act.',
  },
  {
    id: 'AUTH-63',
    citation: 'K.S.A. 65-523',
    type: 'statute',
    holding:
      'The KDHE secretary may limit, modify, or suspend any license on five grounds, including: (a) violation of the act or regulations, (b) aiding or permitting violations, and (c) "conduct in the operation or maintenance...which is inimical to the health, safety or welfare of any...child."',
    verification: 'VERIFIED',
    relevance:
      'Three of the five grounds for license suspension are potentially implicated: (a) violation of 65-508 supervision/care standards; (b) aiding or permitting violations by failing to enforce policies; (c) conduct inimical to child welfare — five staff present but zero witnesses to an assault on a six-year-old.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0023.html',
    keyQuote:
      'Conduct in the operation or maintenance, or both the operation and maintenance, of a maternity center or child care facility which is inimical to the health, safety or welfare of any woman or child receiving services from such maternity center or child care facility, or the public.',
  },
  {
    id: 'AUTH-64',
    citation: 'K.S.A. 65-524',
    type: 'statute',
    holding:
      'KDHE may suspend a license prior to any hearing when the action "is necessary to protect any child in the child care facility from physical or mental abuse, abandonment or any other substantial threat to health, safety or welfare."',
    verification: 'VERIFIED',
    relevance:
      'The emergency suspension standard — "physical or mental abuse...or any other substantial threat" — describes what happened. A six-year-old was physically assaulted by a nine-year-old while under supervised care. This is the statutory mechanism that exists to protect children in exactly this situation.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0024.html',
    keyQuote:
      'The secretary may limit, modify or suspend any license or temporary permit...prior to any hearing when, in the opinion of the secretary, the action is necessary to protect any child in the child care facility from physical or mental abuse, abandonment or any other substantial threat to health, safety or welfare.',
  },
  {
    id: 'AUTH-65',
    citation: 'K.S.A. 65-526',
    type: 'statute',
    holding:
      'KDHE may assess civil fines up to $500 per violation per day for any violation that "significantly and adversely" affects health, safety, or sanitation of children. This is in addition to any other penalty under Article 5.',
    verification: 'VERIFIED',
    relevance:
      'Civil fines up to $500/day per violation, on top of criminal penalties under 65-514. For sustained non-compliance across multiple provisions — supervision failures, incomplete records, failure to follow board policies — the financial exposure compounds rapidly.',
    url: 'https://ksrevisor.gov/statutes/chapters/ch65/065_005_0026.html',
    keyQuote:
      'The secretary of health and environment...may assess a civil fine...against a licensee for each violation of such provisions or rules and regulations adopted pursuant thereto which affect significantly and adversely the health, safety or sanitation of children in a child care facility. Each civil fine assessed under this section shall not exceed $500. In the case of a continuing violation, every day such violation continues shall be deemed a separate violation.',
  },
];

data.sources.push(...newSources);
writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
console.log(`Added ${newSources.length} Article 5 sources (AUTH-55 through AUTH-65). Total sources: ${data.sources.length}`);
