import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const patches = [
  {
    name: '@dcloudio/vite-plugin-uni',
    version: '3.0.0-5030420261029002',
  },
  {
    name: '@uni-helper/vite-plugin-uni-manifest',
    version: '0.7.0',
  },
]

const patched = '^5.2.8 || ^6.0.0'

for (const lockFile of ['package-lock.json', 'node_modules/.package-lock.json']) {
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'))
  let changed = false
  for (const patch of patches) {
    const entry = lock.packages?.[`node_modules/${patch.name}`]
    if (entry?.peerDependencies?.vite !== undefined && entry.peerDependencies.vite !== patched) {
      entry.peerDependencies.vite = patched
      changed = true
    }
  }
  if (changed) writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
}

for (const patch of patches) {
  const file = join('node_modules', patch.name, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  if (manifest.name !== patch.name || manifest.version !== patch.version) {
    throw new Error(`Unexpected package version for ${patch.name}: ${manifest.version}`)
  }
  const peer = manifest.peerDependencies?.vite
  if (peer === undefined) {
    throw new Error(`Missing Vite peer dependency for ${patch.name}`)
  }
  if (peer === patched) continue
  manifest.peerDependencies.vite = patched
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`Patched Vite peer range for ${patch.name}@${patch.version}`)
}
