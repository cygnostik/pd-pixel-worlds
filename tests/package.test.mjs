import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {build} from 'esbuild';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('native desktop package declares no backend capabilities or requirements', async () => {
  // JSON is a YAML subset, keeping this manifest test dependency-free.
  const manifest = JSON.parse(await read('plugin.yaml'));
  assert.equal(manifest.name, 'pixel-worlds');
  assert.equal(manifest.version, JSON.parse(await read('package.json')).version);
  assert.equal(manifest.kind, 'standalone');
  assert.ok(manifest.description);
  for (const field of ['provides_tools', 'provides_hooks', 'requires_env', 'python_dependencies']) {
    assert.deepEqual(manifest[field], []);
  }
  for (const field of ['requires_hermes', 'python_runtime', 'provides_middleware']) {
    assert.equal(Object.hasOwn(manifest, field), false);
  }
  await assert.rejects(access(new URL('__init__.py', root)), {code: 'ENOENT'});
});

test('both desktop delivery doors contain the same valid supported-import ESM bundle', async () => {
  const standalone = await read('plugin.js');
  assert.equal(await read('desktop/plugin.js'), standalone);
  const result = await build({stdin: {contents: standalone, loader: 'js'}, bundle: true,
    write: false, format: 'esm', metafile: true, logLevel: 'silent',
    external: ['react', 'react/jsx-runtime', '@hermes/plugin-sdk']});
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports);
  assert.ok(imports.some(item => item.path === '@hermes/plugin-sdk'));
  assert.ok(imports.every(item => ['react', 'react/jsx-runtime', '@hermes/plugin-sdk'].includes(item.path)));
  assert.match(standalone, /id:\s*["']pixel-worlds["']/);
  assert.match(standalone, /path:\s*["']\/pixel-worlds["']/);
  assert.match(standalone, /path:\s*["']\/pw-agents["']/);
});
