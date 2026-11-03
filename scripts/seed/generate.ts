/** Writes the synthetic CVs to seed/cvs/ so they can also be uploaded by hand in a demo. */
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { buildSeedCvs } from './cv-data'

async function main() {
  const dir = path.join(process.cwd(), 'seed', 'cvs')
  await mkdir(dir, { recursive: true })
  const cvs = await buildSeedCvs()
  for (const cv of cvs) await writeFile(path.join(dir, cv.filename), cv.data)
  console.log(`Wrote ${cvs.length} CVs to ${dir}`)
}

main()
