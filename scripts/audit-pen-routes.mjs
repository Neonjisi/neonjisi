import fs from 'node:fs'
import path from 'node:path'

const root = new URL('..', import.meta.url).pathname
const pen = JSON.parse(fs.readFileSync(path.join(root, 'design/neonjisi.pen'), 'utf8'))

function filesIn(directory, predicate, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) filesIn(target, predicate, output)
    else if (predicate(target)) output.push(target)
  }
  return output
}

function normalize(route) {
  const pathname = route.split('?')[0].replace(/\[(?:id|token|userId)\]/g, '[param]')
  return pathname !== '/' ? pathname.replace(/\/$/, '') : pathname
}

const pageFiles = filesIn(path.join(root, 'app'), (file) => file.endsWith(`${path.sep}page.tsx`))
const appRoutes = pageFiles.map((file) => {
  const relative = path.relative(path.join(root, 'app'), path.dirname(file)).split(path.sep).join('/')
  return normalize(relative ? `/${relative}` : '/')
})
const appRouteSet = new Set(appRoutes)

const penScreens = []
function collectPenScreens(node) {
  if (node?.type === 'frame' && node.width === 390 && node.height === 844 && node.name?.startsWith('/')) {
    penScreens.push({ id: node.id, name: node.name, route: normalize(node.name.split(' · ')[0]) })
  }
  for (const child of node?.children ?? []) collectPenScreens(child)
}
collectPenScreens(pen)
const penRouteSet = new Set(penScreens.map((screen) => screen.route))

const virtualPenRoutes = new Set(['/404', '/error'])
const appWithoutPen = [...new Set(appRoutes.filter((route) => !penRouteSet.has(route)))]
const penWithoutApp = penScreens.filter((screen) => !appRouteSet.has(screen.route) && !virtualPenRoutes.has(screen.route))

const sourceFiles = filesIn(path.join(root, 'app'), (file) => /\.(ts|tsx)$/.test(file))
  .concat(filesIn(path.join(root, 'components'), (file) => /\.(ts|tsx)$/.test(file)))
const literalTargets = []
const patterns = [
  /(?:href|backHref)=["'](\/[^"']*)["']/g,
  /(?:redirect|router\.(?:push|replace))\(["'](\/[^"']*)["']/g,
]
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8')
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) literalTargets.push({ file: path.relative(root, file), target: match[1] })
  }
}
const missingTargets = literalTargets.filter(({ target }) => !appRouteSet.has(normalize(target)))

console.log(`앱 라우트 ${appRoutes.length}개 · PEN 화면 ${penScreens.length}개 · 고정 이동 대상 ${literalTargets.length}개`)
console.log(`앱에만 있는 라우트: ${appWithoutPen.length ? appWithoutPen.join(', ') : '없음'}`)
console.log(`PEN에만 있는 실제 라우트: ${penWithoutApp.length ? penWithoutApp.map((screen) => screen.name).join(', ') : '없음'}`)
console.log(`존재하지 않는 고정 이동 대상: ${missingTargets.length ? missingTargets.map(({ file, target }) => `${file} → ${target}`).join(', ') : '없음'}`)

if (appWithoutPen.length || penWithoutApp.length || missingTargets.length) process.exitCode = 1
