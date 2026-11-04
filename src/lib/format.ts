/** Small display helpers shared by screens. Pure, so they are unit-tested. */

/** "6.5 years experience · 60 days notice", leaving out whatever the CV does not state. */
export function describeFacts(experienceYears: number | null | undefined, noticeDays: number | null | undefined): string {
  const parts: string[] = []
  if (experienceYears != null) parts.push(`${experienceYears} ${experienceYears === 1 ? 'year' : 'years'} experience`)
  if (noticeDays != null) parts.push(noticeDays === 0 ? 'immediate joiner' : `${noticeDays} ${noticeDays === 1 ? 'day' : 'days'} notice`)
  return parts.join(' · ')
}
