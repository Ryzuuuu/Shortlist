/**
 * packages/core/src/skills.ts
 *
 * A shared vocabulary of skills and cities, used both to read CVs (profile-extract)
 * and to read job descriptions (jd-criteria). Matching is whole-word and
 * case-insensitive, so "java" does not match inside "javascript".
 */

export const KNOWN_SKILLS: readonly string[] = [
  // Java and backend
  'java', 'spring boot', 'spring mvc', 'spring security', 'spring', 'hibernate', 'jpa', 'microservices', 'rest apis', 'rest',
  'soap', 'kafka', 'rabbitmq', 'junit', 'maven', 'gradle', 'jenkins', 'kotlin', 'scala', 'golang', 'c#', '.net', 'c++', 'php',
  'python', 'django', 'flask', 'fastapi', 'node.js', 'express', 'graphql',
  // Frontend
  'javascript', 'typescript', 'react', 'next.js', 'angular', 'vue', 'html', 'css', 'redux',
  // Data and cloud
  'sql', 'pl/sql', 'postgresql', 'mysql', 'oracle', 'mongodb', 'redis', 'elasticsearch', 'etl', 'informatica', 'data warehousing',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible', 'devops', 'ci/cd', 'linux', 'git',
  // Testing and delivery
  'selenium', 'cypress', 'playwright', 'postman', 'manual testing', 'automation testing', 'jira', 'agile', 'scrum', 'itil', 'sdlc',
  // Banking back-office and finance
  'kyc', 'aml', 'aml checks', 'reconciliation', 'swift', 'finacle', 'temenos', 'cobol', 'mainframe', 'bfsi', 'compliance',
  'accounts payable', 'accounts receivable', 'gst', 'tally', 'sap', 'excel', 'power bi', 'tableau',
  // Retail and operations
  'inventory management', 'merchandising', 'customer service', 'crm', 'salesforce', 'servicenow', 'pos',
]

const DISPLAY: Record<string, string> = {
  aws: 'AWS', gcp: 'GCP', sql: 'SQL', 'pl/sql': 'PL/SQL', kyc: 'KYC', aml: 'AML', 'aml checks': 'AML checks', sap: 'SAP', crm: 'CRM',
  etl: 'ETL', gst: 'GST', itil: 'ITIL', bfsi: 'BFSI', sdlc: 'SDLC', jpa: 'JPA', pos: 'POS', html: 'HTML', css: 'CSS', soap: 'SOAP',
  'ci/cd': 'CI/CD', 'rest apis': 'REST APIs', rest: 'REST', 'node.js': 'Node.js', 'next.js': 'Next.js', '.net': '.NET', 'c#': 'C#', 'c++': 'C++',
  php: 'PHP', 'power bi': 'Power BI', javascript: 'JavaScript', typescript: 'TypeScript', mongodb: 'MongoDB', postgresql: 'PostgreSQL',
  mysql: 'MySQL', junit: 'JUnit', devops: 'DevOps', graphql: 'GraphQL', rabbitmq: 'RabbitMQ', golang: 'Go', servicenow: 'ServiceNow',
  jira: 'Jira', cobol: 'COBOL', swift: 'SWIFT', tableau: 'Tableau', salesforce: 'Salesforce',
}

/** "spring boot" -> "Spring Boot", "aws" -> "AWS". */
export function skillLabel(skill: string): string {
  return DISPLAY[skill] ?? skill.replace(/(^|[\s/-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** Whole-word position of a skill in lower-cased text, or -1. */
export function skillIndex(lowerText: string, skill: string): number {
  const m = new RegExp(`(?:^|[^a-z0-9])(${escape(skill)})(?![a-z0-9])`).exec(lowerText)
  return m ? m.index + m[0].length - skill.length : -1
}

/** Every known skill in the text, most specific first (so "spring boot" hides "spring"). */
export function findSkills(text: string): string[] {
  const lower = text.toLowerCase()
  const found = KNOWN_SKILLS.filter((s) => skillIndex(lower, s) !== -1)
  const set = new Set(found)
  if (set.has('spring boot') || set.has('spring mvc') || set.has('spring security')) set.delete('spring')
  if (set.has('rest apis')) set.delete('rest')
  if (set.has('aml checks')) set.delete('aml')
  return [...set]
}

export const KNOWN_CITIES: readonly string[] = [
  'Noida', 'Gurugram', 'Gurgaon', 'Delhi', 'New Delhi', 'Faridabad', 'Ghaziabad', 'Mumbai', 'Pune', 'Bengaluru', 'Bangalore',
  'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Chandigarh', 'Indore', 'Kochi', 'Lucknow', 'Nagpur', 'Coimbatore',
]

/** The first known city named in the text, as written there. */
export function findCity(text: string): string | null {
  for (const city of KNOWN_CITIES) {
    const m = new RegExp(`(?:^|[^A-Za-z])(${escape(city)})(?![A-Za-z])`, 'i').exec(text)
    if (m?.[1]) return m[1]
  }
  return null
}
