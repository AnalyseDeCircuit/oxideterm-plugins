import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import semver from 'semver';
import { validateRegistry, validateHistory } from './validate-registry.mjs';

export const repository = path.resolve(import.meta.dirname, '..');
export const defaultCatalog = path.join(repository, 'registry/v1/index.json');
export const sourceDirectory = path.join(repository, 'registry/plugins');
const json = value => JSON.stringify(value, null, 2) + '\n';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, json(value), { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function writeImmutable(file, value) {
  if (fs.existsSync(file)) {
    if (!isDeepStrictEqual(read(file), value)) throw new Error(`Immutable catalog record changed: ${file}`);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, json(value), { flag: 'wx' });
}

function metadataFor(entry, order) {
  const { releases, version, engines, packages, minOxideTermVersion, minOxidetermVersion, ...metadata } = entry;
  return {
    ...metadata,
    order,
    legacy: {
      version,
      ...(engines === undefined ? {} : { engines }),
      ...(minOxideTermVersion === undefined ? {} : { minOxideTermVersion }),
      ...(minOxidetermVersion === undefined ? {} : { minOxidetermVersion }),
    },
  };
}

function writeRelease(root, release, publishedAt) {
  const { compatibilityCorrections = [], ...original } = release;
  const file = path.join(root, 'releases', `${release.version}.json`);
  if (fs.existsSync(file)) {
    if (!isDeepStrictEqual(read(file).release, original)) throw new Error('Published release changed');
  } else {
    writeImmutable(file, { release: original, ...(publishedAt ? { publishedAt } : {}) });
  }
  compatibilityCorrections.forEach((correction, index) => {
    writeImmutable(path.join(root, 'corrections', release.version, `${String(index + 1).padStart(6, '0')}.json`), correction);
  });
}

export function migrateCatalog(catalog, directory = sourceDirectory) {
  validateRegistry(catalog);
  if (fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error('Catalog sources already exist');
  for (const [order, entry] of catalog.plugins.entries()) {
    const root = path.join(directory, entry.id);
    writeJson(path.join(root, 'metadata.json'), metadataFor(entry,order));
    const releases = entry.releases ?? [{ version: entry.version, engines: entry.engines, packages: entry.packages }];
    for (const release of releases) writeRelease(root, release);
  }
  validateHistory(catalog, loadCatalogSources(directory));
}

export function loadCatalogSources(directory = sourceDirectory) {
  const categories = new Set(read(path.join(repository,'registry/categories.json')));
  const plugins = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a,b) => a.name.localeCompare(b.name)).map(entry => {
    const root = path.join(directory, entry.name);
    const metadata = read(path.join(root, 'metadata.json'));
    if (metadata.id !== entry.name || !/^[a-z0-9][a-z0-9.-]*$/.test(metadata.id)) throw new Error('Catalog directory and identity differ');
    if (metadata.tags?.length > 2 || metadata.tags?.some(tag=>!categories.has(tag))) throw new Error('Use at most two registered marketplace categories');
    const { legacy, order, ...display } = metadata;
    if (!Number.isSafeInteger(order) || order < 0) throw new Error('Invalid catalog order');
    const releases = fs.readdirSync(path.join(root, 'releases')).filter(file => file.endsWith('.json')).map(file => {
      const record = read(path.join(root, 'releases', file));
      if (file !== `${record.release.version}.json`) throw new Error('Release filename and version differ');
      const release = structuredClone(record.release);
      if (release.compatibilityCorrections !== undefined) throw new Error('Corrections belong in separate records');
      const corrections = path.join(root, 'corrections', release.version);
      if (fs.existsSync(corrections)) {
        const files = fs.readdirSync(corrections).sort();
        files.forEach((file, index) => { if (file !== `${String(index + 1).padStart(6, '0')}.json`) throw new Error('Correction sequence is incomplete'); });
        if (files.length) release.compatibilityCorrections = files.map(file => read(path.join(corrections,file)));
      }
      if (record.publishedAt) {
        if (Number.isNaN(Date.parse(record.publishedAt))) throw new Error('Invalid release publication time');
        if (!display.updatedAt || Date.parse(record.publishedAt) > Date.parse(display.updatedAt)) display.updatedAt = record.publishedAt;
      }
      return release;
    }).sort((a,b) => semver.compare(a.version,b.version));
    const baseline = releases.find(release => release.version === legacy?.version);
    if (!baseline) throw new Error('Legacy release missing');
    return { order, plugin: { ...display, ...legacy, packages: baseline.packages, releases } };
  }).sort((a,b)=>a.order-b.order || a.plugin.id.localeCompare(b.plugin.id)).map(record=>record.plugin);
  const catalog = { version: 1, plugins };
  validateRegistry(catalog);
  return catalog;
}

export function readCatalog(file = defaultCatalog) {
  if (path.resolve(file) === defaultCatalog) {
    validateFrozenV1();
    return loadCatalogSources();
  }
  return read(file);
}

export function validateFrozenV1(directory = path.join(repository, 'registry')) {
  const bytes = fs.readFileSync(path.join(directory, 'v1/index.json'));
  const expected = fs.readFileSync(path.join(directory, 'v1/index.sha256'), 'utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(expected) || digest(bytes) !== expected) {
    throw new Error('Frozen v1 catalog changed; publish updates only to v2');
  }
  validateRegistry(JSON.parse(bytes));
}

export function importCatalogEntry(entry, directory = sourceDirectory) {
  const previous = loadCatalogSources(directory);
  const current = previous.plugins.find(plugin => plugin.id === entry.id);
  validateRegistry({ version: 1, plugins: [entry] });
  const categories = new Set(read(path.join(repository,'registry/categories.json')));
  if (entry.tags?.length > 2 || entry.tags?.some(tag=>!categories.has(tag))) throw new Error('Unregistered marketplace category');
  const merged = structuredClone(current ?? entry);
  if (current) {
    const probe = { version: 1, plugins: [{...entry, releases: current.releases}] };
    validateHistory({version:1,plugins:[current]}, probe);
    for (const incoming of entry.releases ?? []) {
      const stored = merged.releases.find(release => release.version === incoming.version);
      if (!stored) merged.releases.push(incoming);
      else {
        const {compatibilityCorrections:a=[], ...originalA} = stored;
        const {compatibilityCorrections:b=[], ...originalB} = incoming;
        if (!isDeepStrictEqual(originalA,originalB) || !isDeepStrictEqual(a.slice(0,Math.min(a.length,b.length)),b.slice(0,Math.min(a.length,b.length)))) throw new Error('Conflicting immutable release or correction');
        if (b.length > a.length) stored.compatibilityCorrections = b;
      }
    }
  }
  const next = {version:1,plugins:previous.plugins.filter(plugin=>plugin.id!==entry.id).concat(merged)};
  validateHistory(previous,next);
  const root = path.join(directory,entry.id);
  if (!current) writeImmutable(path.join(root,'metadata.json'),metadataFor(entry,previous.plugins.length));
  for (const release of merged.releases) writeRelease(root,release,entry.updatedAt);
  return loadCatalogSources(directory);
}

export function catalogOutputs(catalog, baseUrl = 'https://raw.githubusercontent.com/AnalyseDeCircuit/oxideterm-plugins/main/registry/v2/') {
  validateRegistry(catalog);
  const files = new Map();
  const plugins = catalog.plugins.map(entry => {
    const bytes = json(entry);
    if (Buffer.byteLength(bytes) > 8*1024*1024) throw new Error(`Plugin history exceeds the client 8 MiB limit: ${entry.id}`);
    const hash = digest(bytes);
    const file = `v2/plugins/${entry.id}/${hash}.json`;
    files.set(file,bytes);
    const latest = [...entry.releases].sort((a,b)=>semver.rcompare(a.version,b.version))[0];
    const { packages, releases, minOxideTermVersion, minOxidetermVersion, downloadUrl, checksum, size, ...summary } = entry;
    return {
      ...summary, version: latest.version,
      engines: latest.compatibilityCorrections?.at(-1)?.engines ?? latest.engines,
      history: {downloadUrl: new URL(file.slice(3),baseUrl).href, checksum:`sha256:${hash}`, size:Buffer.byteLength(bytes)},
    };
  });
  files.set('v2/index.json',json({version:2,plugins}));
  return files;
}

export function generateCatalog({ directory = sourceDirectory, output = path.join(repository,'registry'), check = false } = {}) {
  validateFrozenV1(output);
  const files = catalogOutputs(loadCatalogSources(directory));
  if (Buffer.byteLength(files.get('v2/index.json')) > 2*1024*1024) throw new Error('v2 summary catalog exceeds the client 2 MiB limit');
  for (const [name,bytes] of files) {
    const file = path.join(output,name);
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file,'utf8') !== bytes) throw new Error(`Generated catalog is stale: ${name}`);
    } else {
      if (name !== 'v2/index.json' && fs.existsSync(file) && fs.readFileSync(file,'utf8') !== bytes) throw new Error('Immutable history artifact changed');
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,bytes);
    }
  }
  return files;
}
