/**
 * scripts/seed/cv-data.ts
 *
 * ~40 fully synthetic CVs for the example JD (Senior Java Developer, Noida).
 * The first three are the candidates from the brief's sample data. The rest are
 * generated from a seeded PRNG, so output is identical on every run.
 * Contacts use example.com and a fake phone range; none are real people.
 */
import { makeBrokenPdf, makeDocx, makePdf, makeScannedPdf } from './writers'

export interface SeedCv {
  filename: string
  data: Buffer
  /** What the file is meant to exercise */
  kind: 'normal' | 'duplicate' | 'scanned' | 'broken'
}

interface Person {
  first: string
  last: string
  role: string
  company: string
  skills: string[]
  years: number
  notice: number
  city: string
  phone: string
}

const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Sneha', 'Vikram', 'Anita', 'Karan', 'Isha', 'Manish', 'Neha', 'Sahil', 'Tanvi', 'Yash', 'Zoya', 'Harsh', 'Kavya', 'Nikhil', 'Priya', 'Rahul', 'Shreya', 'Tarun', 'Uma', 'Dev', 'Ira', 'Om', 'Riya', 'Ved', 'Zara', 'Ansh', 'Bela', 'Chirag']
const LAST = ['Sharma', 'Verma', 'Gupta', 'Iyer', 'Menon', 'Kapoor', 'Joshi', 'Bhatt', 'Saxena', 'Mishra', 'Chauhan', 'Pillai', 'Desai', 'Khanna', 'Malhotra', 'Reddy', 'Tiwari']
const COMPANIES = ['Northwind Systems', 'Bluepeak Tech', 'Orbit Financial Services', 'Kestrel Retail Tech', 'Meridian Infosys', 'Paragon Digital']
const CITIES = ['Noida', 'Gurugram', 'Delhi', 'Bengaluru', 'Pune', 'Hyderabad']

const JAVA_STACKS = [
  ['Java', 'Spring Boot', 'microservices', 'Hibernate', 'REST APIs', 'Kafka'],
  ['Java', 'Spring Boot', 'REST APIs', 'PostgreSQL', 'Docker'],
  ['Java', 'Spring', 'Hibernate', 'MySQL', 'JUnit'],
  ['Java', 'microservices', 'Spring Boot', 'AWS', 'Kubernetes'],
]
const JAVA_ROLES = ['Senior Java Developer', 'Java Developer', 'Backend Engineer']
const OTHER_STACKS: Array<[string, string[]]> = [
  ['KYC Analyst', ['KYC', 'AML checks', 'Excel']],
  ['Frontend Developer', ['JavaScript', 'React', 'TypeScript']],
  ['QA Engineer', ['Selenium', 'JUnit', 'SQL']],
  ['Python Developer', ['Python', 'Django', 'PostgreSQL']],
  ['Accounts Executive', ['Tally', 'Excel', 'SAP']],
]

/** Small deterministic PRNG (LCG) so the seed data never changes between runs. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function render(p: Person, style: number): string[] {
  const email = `${p.first}.${p.last}@example.com`.toLowerCase()
  const skills = p.skills.join(', ')
  const exp = `${p.years} years of experience. Notice period: ${p.notice} days.`
  const head = [`${p.first} ${p.last}`, p.role, `${email} | ${p.phone}`]
  if (style === 0) {
    return [...head, `Location: ${p.city}`, 'EXPERIENCE', `${p.role} at ${p.company}`, exp, 'SKILLS', skills]
  }
  if (style === 1) {
    return [...head, `${p.role}, ${p.company}`, `Key skills: ${skills}`, exp, `Location: ${p.city}`]
  }
  return [`${p.first} ${p.last}`, p.role, `Skills: ${skills}`, `${p.role} - ${p.company}`, exp, `${email} / ${p.phone}`, `City: ${p.city}`]
}

export async function buildSeedCvs(): Promise<SeedCv[]> {
  const rand = rng(42)
  const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)] as T

  const people: Person[] = [
    { first: 'Ritika', last: 'Bansal', role: 'Senior Java Developer', company: 'Northwind Systems', skills: ['Java', 'Spring Boot', 'microservices'], years: 6.5, notice: 60, city: 'Noida', phone: '+91 90000 00001' },
    { first: 'Arjun', last: 'Rawat', role: 'KYC Analyst', company: 'Orbit Financial Services', skills: ['KYC', 'AML checks', 'Excel'], years: 3, notice: 30, city: 'Delhi', phone: '+91 90000 00002' },
    { first: 'Pooja', last: 'Nair', role: 'Java Developer', company: 'Meridian Infosys', skills: ['Java', 'Hibernate', 'REST APIs'], years: 4, notice: 90, city: 'Pune', phone: '+91 90000 00003' },
  ]
  for (let i = 0; i < 37; i++) {
    const java = i < 25
    const other = pick(OTHER_STACKS)
    people.push({
      first: FIRST[i % FIRST.length] as string,
      last: LAST[(i * 5 + 3) % LAST.length] as string,
      role: java ? pick(JAVA_ROLES) : other[0],
      company: pick(COMPANIES),
      skills: java ? pick(JAVA_STACKS) : other[1],
      years: Math.round((1 + rand() * 10) * 2) / 2,
      notice: pick([15, 30, 45, 60, 90]),
      city: pick(CITIES),
      phone: `+91 90000 ${String(100 + i).padStart(5, '0')}`,
    })
  }

  const cvs: SeedCv[] = []
  for (const [i, p] of people.entries()) {
    const lines = render(p, i % 3)
    const base = `${String(i + 1).padStart(2, '0')}_${p.first}_${p.last}`
    // Mix formats: every third CV is a DOCX.
    if (i % 3 === 2) cvs.push({ filename: `${base}.docx`, data: await makeDocx(lines), kind: 'normal' })
    else cvs.push({ filename: `${base}.pdf`, data: makePdf(lines), kind: 'normal' })
  }

  // Duplicate 1: same person as Ritika, different format, e-mail in upper case (email match).
  const ritika = people[0] as Person
  const dup1 = render(ritika, 1).map((l) => l.replace(/ritika\.bansal@example\.com/i, 'RITIKA.BANSAL@EXAMPLE.COM'))
  cvs.push({ filename: 'dup_Ritika_Bansal_updated.docx', data: await makeDocx(dup1), kind: 'duplicate' })

  // Duplicate 2: same person as Pooja, new e-mail, phone written differently (phone match).
  const pooja = people[2] as Person
  const dup2 = render(pooja, 0).map((l) =>
    l.replace(/\S+@example\.com/, 'pooja.n@example.org').replace('+91 90000 00003', '+91-90000-00003'),
  )
  cvs.push({ filename: 'dup_Pooja_Nair_resume.pdf', data: makePdf(dup2), kind: 'duplicate' })

  cvs.push({ filename: 'scanned_cv_no_text_layer.pdf', data: makeScannedPdf(), kind: 'scanned' })
  cvs.push({ filename: 'broken_cv_corrupt.pdf', data: makeBrokenPdf(), kind: 'broken' })
  return cvs
}
