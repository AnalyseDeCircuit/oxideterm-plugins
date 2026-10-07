import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseArgs, isDeepStrictEqual} from 'node:util';
import {readCatalog, importCatalogEntry, generateCatalog} from './catalog-source.mjs';
import {recordRelease} from './release-plugin.mjs';
import {validateRegistry} from './validate-registry.mjs';
import {unzipSync, strFromU8} from 'fflate';
import semver from 'semver';

const {values} = parseArgs({options:{repository:{type:'string',default:process.env.GITHUB_REPOSITORY},'dry-run':{type:'boolean',default:false}}});
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(values.repository??'')) throw new Error('A repository owner/name is required');
const gh = args => execFileSync('gh',args,{encoding:'utf8',maxBuffer:16*1024*1024});
let catalog=readCatalog();
let imported=0;
const registered=new Set(catalog.plugins.flatMap(plugin=>plugin.releases.flatMap(record=>record.packages.map(pkg=>pkg.downloadUrl.slice(0,pkg.downloadUrl.lastIndexOf('/'))))));
const releaseBase=tag=>`https://github.com/${values.repository}/releases/download/${encodeURIComponent(tag)}`;
const published=[];
for(let page=1;;page++) {
  const releases=JSON.parse(gh(['api',`repos/${values.repository}/releases?per_page=100&page=${page}`]));
  if(!releases.length) break;
  published.push(...releases.filter(release=>!release.draft && !release.prerelease && !registered.has(releaseBase(release.tag_name)) && release.assets.some(asset=>asset.name==='catalog-entry.json')));
}
// Catch-up runs must establish a new plugin's verified legacy release before
// importing later versions whose producer snapshots contain that baseline.
published.sort((a,b)=>Date.parse(a.published_at)-Date.parse(b.published_at) || a.tag_name.localeCompare(b.tag_name));
for(const release of published) {
    const asset=release.assets.find(asset=>asset.name==='catalog-entry.json');
    if(!asset) continue;
    if(asset.size>1024*1024 || !/^[A-Za-z0-9_.-]+$/.test(release.tag_name)) throw new Error('Invalid release metadata asset');
    const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'oxideterm-catalog-sync-'));
    try {
      gh(['release','download',release.tag_name,'--repo',values.repository,'--pattern','catalog-entry.json','--dir',temporary]);
      const entry=JSON.parse(fs.readFileSync(path.join(temporary,'catalog-entry.json')));
      validateRegistry({version:1,plugins:[entry]});
      const known=catalog.plugins.find(plugin=>plugin.id===entry.id);
      const missing=(entry.releases??[]).filter(record=>!known?.releases?.some(stored=>stored.version===record.version));
      if(!missing.length && known) continue;
      const base=releaseBase(release.tag_name);
      const records=missing.filter(record=>record.packages.every(pkg=>pkg.downloadUrl.startsWith(base+'/')));
      if(records.length!==1) throw new Error('Release metadata must identify exactly one new version in this Release');
      const record=records[0];
      if(record.compatibilityCorrections?.length) throw new Error('Compatibility corrections require a separate reviewed source record');
      const packageArguments=[];
      let manifest;
      for(const pkg of record.packages) {
        const uploaded=release.assets.find(asset=>asset.browser_download_url===pkg.downloadUrl);
        if(!uploaded || uploaded.size!==pkg.size || !/^[A-Za-z0-9_.-]+\.zip$/.test(uploaded.name)) throw new Error('Catalog package is not an exact uploaded Release asset');
        gh(['release','download',release.tag_name,'--repo',values.repository,'--pattern',uploaded.name,'--dir',temporary]);
        const file=path.join(temporary,uploaded.name);
        const bytes=fs.readFileSync(file);
        const entries=Object.values(unzipSync(bytes,{filter:file=>/^(?:[^/]+\/)?plugin\.json$/.test(file.name) && file.originalSize<=1024*1024}));
        if(entries.length!==1) throw new Error('Invalid packaged manifest');
        const packaged=JSON.parse(strFromU8(entries[0]));
        if(packaged.id!==entry.id || packaged.version!==record.version || !isDeepStrictEqual(packaged.engines,record.engines)) throw new Error('Release asset manifest differs from its catalog record');
        manifest??=packaged;
        packageArguments.push(`${pkg.target}=${file}`);
      }
      const verifiedEntry=recordRelease({version:1,plugins:[]},manifest,base,packageArguments).plugins[0];
      const verified=verifiedEntry.releases[0];
      const byTarget=packages=>[...packages].sort((a,b)=>a.target.localeCompare(b.target));
      if(!isDeepStrictEqual(byTarget(verified.packages),byTarget(record.packages))) throw new Error('Uploaded asset checksum or size differs from catalog record');
      // Import only the release verified here. Stale producer snapshots cannot
      // remove later releases or carry unverified extra versions into the catalog.
      const incoming={...entry,releases:known?.releases ? structuredClone(known.releases).concat(record) : [record]};
      if(verifiedEntry.language) incoming.language=verifiedEntry.language;
      else delete incoming.language;
      if(!known && incoming.version!==record.version) throw new Error('A new plugin must establish its legacy record from the verified release');
      if(!values['dry-run']) catalog=importCatalogEntry(incoming);
      else {
        const updated=known ? {...known,releases:incoming.releases} : incoming;
        if(!known || known.releases.every(stored=>semver.lt(stored.version,record.version))) {
          if(incoming.language) updated.language=incoming.language;
          else delete updated.language;
        }
        catalog={...catalog,plugins:catalog.plugins.filter(plugin=>plugin.id!==entry.id).concat(updated)};
      }
      imported++;
    } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
}
if(!values['dry-run']) generateCatalog();
console.log(`${values['dry-run']?'Verified':'Imported'} ${imported} unpublished catalog release(s)`);
