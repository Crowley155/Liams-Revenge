import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '..', 'data', 'case-data.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

const policyManualUrl = 'https://www.usd232.org/fs/resource-manager/view/7f88c7fb-3827-4130-9b93-9e95a6e82038';
const policiesHubUrl = 'https://www.usd232.org/about-us/board-of-education/policies';

const newSources = [
  {
    id: 'BP-01',
    citation: 'USD 232 Board Policy KG — Use of School Facilities by Community Groups',
    type: 'board-policy',
    holding: 'Requires a school employee to be on duty whenever non-school groups use school facilities. Board must approve all lease arrangements.',
    relevance: 'Lease §8(d) binds JCPRD to this policy. No USD 232 employee was on duty during JCPRD\'s OST program at Mize Elementary to ensure proper use of the building and grounds.',
    keyQuote: 'Whenever any school facility is used by non-school groups or individuals, a school employee shall be on duty to see that the building and equipment are properly used.',
    url: policyManualUrl,
    relevanceScore: { total: 92, band: 'critical', factors: { probative: 10, reliability: 9, corroboration: 9, contradiction: 9, materiality: 9 } }
  },
  {
    id: 'BP-02',
    citation: 'USD 232 Board Policy JGFB — Supervision of Students',
    type: 'board-policy',
    holding: 'Students under school jurisdiction must be supervised by school personnel. All school-sponsored activities must be supervised by an administration-approved adult.',
    relevance: 'The district presents JCPRD OST as a service it "offers." If school-sponsored, the principal must coordinate supervision with approved adults. JCPRD staff were never approved by administration under this policy.',
    keyQuote: 'Students shall be supervised by school personnel when they are under the jurisdiction of the school. All school-sponsored activities shall be supervised by an adult approved by the administration.',
    url: policyManualUrl,
    relevanceScore: { total: 88, band: 'critical', factors: { probative: 9, reliability: 9, corroboration: 9, contradiction: 8, materiality: 9 } }
  },
  {
    id: 'BP-03',
    citation: 'USD 232 Board Policy JDDC — Student Bullying',
    type: 'board-policy',
    holding: 'Expressly prohibits bullying on school property and at all school-sponsored activities, programs, or events. Requires administration to implement a bullying prevention plan.',
    relevance: 'JDDC applies "on school property" without time-of-day limitation. The administration was required to implement a bullying plan covering the JCPRD program on school grounds. No evidence this was done for JCPRD\'s after-school program.',
    keyQuote: 'State and Federal Law and Board policy expressly prohibit bullying in any form, including electronic means (cyberbullying) and harassment at school, on school property, and at all school-sponsored activities, programs, or events.',
    url: 'https://www.usd232.org/policy-details/~board/boe-policies/post/jddc-student-bullying',
    relevanceScore: { total: 95, band: 'critical', factors: { probative: 10, reliability: 10, corroboration: 9, contradiction: 9, materiality: 10 } }
  },
  {
    id: 'BP-04',
    citation: 'USD 232 Board Policy JDDB — Reporting Crimes to Law Enforcement',
    type: 'board-policy',
    holding: 'Principal SHALL report conduct constituting a misdemeanor or felony on school property or at school-supervised activities that resulted in or was substantially likely to result in serious bodily injury.',
    relevance: 'An assault causing physical injury occurred on school property during a program the district presents as its own. The principal had a mandatory duty to report to law enforcement under this policy. No evidence a report was filed.',
    keyQuote: 'Whenever a student engages in conduct which constitutes the commission of any misdemeanor or felony, at school, on school property, or at a school supervised activity and/or has been found... to have engaged in behavior... which has resulted in or was substantially likely to have resulted in serious bodily injury to others, the principal shall report such act to the appropriate law enforcement agency.',
    url: policyManualUrl,
    relevanceScore: { total: 90, band: 'critical', factors: { probative: 10, reliability: 9, corroboration: 8, contradiction: 9, materiality: 9 } }
  },
  {
    id: 'BP-05',
    citation: 'USD 232 Board Policy JH — Student Activities',
    type: 'board-policy',
    holding: 'The principal is responsible for organizing and approving all student activities. All school-sponsored activities must be supervised by an administration-approved adult. Cross-references KG.',
    relevance: 'If the JCPRD OST program qualifies as a school-sponsored activity (the district\'s website presents it as such), the principal must organize, approve, and ensure adult supervision — none of which occurred.',
    keyQuote: 'The principal shall be responsible for organizing and approving all student activities. All school-sponsored activities shall be supervised by an adult approved by the administration.',
    url: policyManualUrl,
    relevanceScore: { total: 82, band: 'critical', factors: { probative: 8, reliability: 9, corroboration: 8, contradiction: 8, materiality: 8 } }
  },
  {
    id: 'BP-06',
    citation: 'USD 232 Board Policy KGD — Disruptive Acts at School or School Activities',
    type: 'board-policy',
    holding: 'Persons threatening the safety of students or school personnel will be asked to leave. School administration and staff are responsible for handling any disturbance.',
    relevance: 'Establishes that school administration is responsible for handling safety threats at school activities — not just during school hours. Cross-references EBC, GAAE, JCDBB, and JDDC.',
    keyQuote: 'Persons threatening the safety of students, school personnel, or other persons; to damage school property; or to interfere with school or school activities or the educational process will be asked to leave the premises.',
    url: policyManualUrl,
    relevanceScore: { total: 72, band: 'high', factors: { probative: 7, reliability: 9, corroboration: 7, contradiction: 7, materiality: 7 } }
  },
  {
    id: 'BP-07',
    citation: 'USD 232 Board Policy KFD — School Volunteers',
    type: 'board-policy',
    holding: 'School volunteers are bound by all district policies, rules, and regulations and work under school staff direction.',
    relevance: 'If even unpaid volunteers are bound by district policies, it is inconsistent for the district to claim a paid lessee (JCPRD) operating on school property is not. Strengthens the §8(d) obligation argument.',
    keyQuote: 'School volunteers are bound by the policies, rules and regulations of the district, serve without financial compensation and are not covered by workers\' compensation.',
    url: policyManualUrl,
    relevanceScore: { total: 65, band: 'high', factors: { probative: 7, reliability: 8, corroboration: 6, contradiction: 7, materiality: 6 } }
  },
  {
    id: 'BP-08',
    citation: 'USD 232 Board Policy EBC — Security and Safety',
    type: 'board-policy',
    holding: 'Umbrella security and safety policy cross-referencing JCAC, JCDBB, JDD, JDDB, JDDC, JGGA, and KGD. Authorizes security devices and measures to prevent intrusions or disturbances on school property.',
    relevance: 'Creates a web of safety obligations on school property. The cross-references to JDDB (crime reporting), JDDC (bullying), and KGD (disruptive acts) all apply to activity on school property regardless of who is operating the program.',
    keyQuote: 'Security devices may be installed at district attendance centers. Other measures may be taken to prevent intrusions or disturbances from occurring in school buildings or trespassing on school grounds.',
    url: policyManualUrl,
    relevanceScore: { total: 68, band: 'high', factors: { probative: 7, reliability: 8, corroboration: 7, contradiction: 6, materiality: 7 } }
  },
  {
    id: 'BP-09',
    citation: 'USD 232 "Before/After School Services" Webpage',
    type: 'web-evidence',
    holding: 'USD 232\'s own website presents JCPRD\'s Out of School Time program as a district service, stating the district "partners with JCPRD to offer" before/after school programming.',
    relevance: 'Undercuts the "passive landlord" defense. The district presents this as its own offering to families under "Family Resources > Family and Student Services." A parent visiting the district website would reasonably conclude this is a district-operated or district-endorsed program subject to district standards.',
    keyQuote: 'USD 232 partners with Johnson County Parks & Recreation District to offer before/after school programming for elementary students.',
    url: 'https://www.usd232.org/family-resources/family-and-student-services/beforeafter-school-services',
    relevanceScore: { total: 91, band: 'critical', factors: { probative: 10, reliability: 9, corroboration: 9, contradiction: 9, materiality: 9 } }
  },
];

const existingIds = new Set(data.sources.map(s => s.id));
const toAdd = newSources.filter(s => !existingIds.has(s.id));

if (toAdd.length === 0) {
  console.log('All board policy sources already exist.');
} else {
  data.sources.push(...toAdd);
  writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`Added ${toAdd.length} new sources: ${toAdd.map(s => s.id).join(', ')}`);
}
