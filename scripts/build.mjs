import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const lib = resolve(root, 'lib')

await mkdir(lib, { recursive: true })
execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['--emitDeclarationOnly'], {
  cwd: root,
  stdio: 'inherit',
})

await build({
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(lib, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['@deepseek-ai/*', 'node:*'],
  sourcemap: true,
  legalComments: 'none',
})

await build({
  entryPoints: [resolve(root, 'src/client/index.tsx')],
  outfile: resolve(lib, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/*',
  ],
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "noumena-luna", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: {
    js: 'return module.exports; } });',
  },
  sourcemap: true,
  legalComments: 'none',
})

console.log(`Built ${dirname(resolve(lib, 'index.js'))}`)
