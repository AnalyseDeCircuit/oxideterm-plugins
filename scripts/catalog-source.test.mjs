import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {zipSync, strToU8} from 'fflate';
import {recordRelease} from './release-plugin.mjs';
import {migrateCatalog, loadCatalogSources, importCatalogEntry, catalogOutputs, generateCatalog, validateFrozenV1} from './catalog-source.mjs';

const release = version => ({version,engines:{oxideterm:'>=2.1.0'},packages:[{
  target:'any',downloadUrl:`https://example.com/releases/${version}/plugin.zip`,checksum:'a'.repeat(64),size:128,
}]});
const plugin = id => ({id,name:id,version:'0.1.0',engines:{oxideterm:'>=2.1.0'},tags:['utilities'],packages:release('0.1.0').packages,releases:[release('0.1.0')]});
const initial = {version:1,plugins:[plugin('com.example.z'),plugin('com.example.a')]};

function freezeV1(directory, catalog=initial) {
  fs.mkdirSync(path.join(directory,'v1'),{recursive:true});
  const bytes=JSON.stringify(catalog,null,2)+'\n';
  fs.writeFileSync(path.join(directory,'v1/index.json'),bytes);
  fs.writeFileSync(path.join(directory,'v1/index.sha256'),createHash('sha256').update(bytes).digest('hex')+'\n');
  return bytes;
}

test('generation leaves the frozen v1 bytes unchanged when plugins, releases and corrections advance', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'oxideterm-frozen-catalog-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'sources');
  const output=path.join(root,'registry');
  const frozen=freezeV1(output);
  migrateCatalog(initial,source);
  const updated=structuredClone(initial.plugins[0]);
  const metadataPath=path.join(source,updated.id,'metadata.json');
  const metadata=JSON.parse(fs.readFileSync(metadataPath));
  metadata.license='MIT';
  metadata.licenseUrl='https://example.com/LICENSE';
  fs.writeFileSync(metadataPath,JSON.stringify(metadata));
  updated.releases.push(release('0.2.0'));
  updated.releases[0].compatibilityCorrections=[{engines:{oxideterm:'>=2.1.0, <3.0.0'},reason:'Removed API',recordedAt:'2026-10-06T00:00:00Z'}];
  importCatalogEntry(updated,source);
  importCatalogEntry(plugin('com.example.new'),source);
  generateCatalog({directory:source,output});
  assert.equal(fs.readFileSync(path.join(output,'v1/index.json'),'utf8'),frozen);
  const summary=JSON.parse(fs.readFileSync(path.join(output,'v2/index.json')));
  assert.equal(summary.plugins[0].license,'MIT');
  assert.equal(summary.plugins[0].licenseUrl,'https://example.com/LICENSE');
  assert.deepEqual(summary.plugins.map(entry=>[entry.id,entry.version]),[['com.example.z','0.2.0'],['com.example.a','0.1.0'],['com.example.new','0.1.0']]);
  const referenced=summary.plugins[0].history.checksum.slice('sha256:'.length);
  const history=JSON.parse(fs.readFileSync(path.join(output,'v2/plugins/com.example.z',referenced+'.json')));
  assert.equal(history.license,'MIT');
  assert.equal(history.licenseUrl,'https://example.com/LICENSE');
  assert.deepEqual(history.releases[0].compatibilityCorrections,updated.releases[0].compatibilityCorrections);
  fs.appendFileSync(path.join(output,'v1/index.json'),'\n');
  assert.throws(()=>validateFrozenV1(output),/Frozen v1 catalog changed/);
  assert.throws(()=>generateCatalog({directory:source,output}),/Frozen v1 catalog changed/);
  assert.equal(fs.readFileSync(path.join(output,'v1/index.json'),'utf8'),frozen+'\n');
});

test('v2 history can grow beyond the old full-index size limit', () => {
  const expanded=structuredClone(initial.plugins[0]);
  expanded.releases.push(...Array.from({length:6000},(_,index)=>release(`0.2.${index}`)));
  assert.ok(Buffer.byteLength(JSON.stringify({version:1,plugins:[expanded]},null,2))>2*1024*1024);
  const files=catalogOutputs({version:1,plugins:[expanded]});
  assert.equal(files.has('v1/index.json'),false);
  const index=JSON.parse(files.get('v2/index.json'));
  assert.equal(index.plugins[0].version,'0.2.5999');
  assert.ok(index.plugins[0].history.size>2*1024*1024);
});

test('split migration preserves the entire v1 contract and v2 binds summaries to immutable histories', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'oxideterm-catalog-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'sources');
  migrateCatalog(initial,source);
  assert.deepEqual(loadCatalogSources(source),initial);
  const files=catalogOutputs(initial);
  assert.equal(files.has('v1/index.json'),false);
  const compact=JSON.parse(files.get('v2/index.json'));
  assert.equal(compact.version,2);
  assert.deepEqual(compact.plugins.map(entry=>entry.id),['com.example.z','com.example.a']);
  for(const entry of compact.plugins) {
    assert.equal(entry.packages,undefined);
    assert.equal(entry.releases,undefined);
    const relative=new URL(entry.history.downloadUrl).pathname.split('/registry/')[1];
    const body=files.get(relative);
    assert.equal(entry.history.checksum,'sha256:'+createHash('sha256').update(body).digest('hex'));
    assert.equal(entry.history.size,Buffer.byteLength(body));
    assert.equal(JSON.parse(body).id,entry.id);
  }
  const output=path.join(root,'generated');
  freezeV1(output);
  generateCatalog({directory:source,output});
  generateCatalog({directory:source,output,check:true});
  fs.writeFileSync(path.join(output,'v2/index.json'),'{}');
  assert.throws(()=>generateCatalog({directory:source,output,check:true}),/stale/);
});

test('stale parallel release records merge without losing other releases and refuse changed assets', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'oxideterm-catalog-import-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  migrateCatalog(initial,root);
  for(const [id,version] of [['com.example.z','0.2.0'],['com.example.a','0.2.0'],['com.example.z','0.3.0']]) {
    const incoming=structuredClone(initial.plugins.find(entry=>entry.id===id));
    incoming.updatedAt='2026-10-06T00:00:00Z';
    incoming.releases.push(release(version));
    importCatalogEntry(incoming,root);
  }
  const catalog=loadCatalogSources(root);
  assert.deepEqual(catalog.plugins.map(entry=>[entry.id,entry.releases.map(release=>release.version)]),[
    ['com.example.z',['0.1.0','0.2.0','0.3.0']],['com.example.a',['0.1.0','0.2.0']],
  ]);
  importCatalogEntry(initial.plugins[0],root);
  assert.deepEqual(loadCatalogSources(root),catalog);
  const tampered=structuredClone(catalog.plugins[0]);
  tampered.releases[1].packages[0].checksum='b'.repeat(64);
  assert.throws(()=>importCatalogEntry(tampered,root),/immutable release/);
  assert.deepEqual(loadCatalogSources(root),catalog);
  const corrected=structuredClone(catalog.plugins[0]);
  corrected.releases[1].compatibilityCorrections=[{engines:{oxideterm:'>=2.1.0, <3.0.0'},reason:'API removed',recordedAt:'2026-10-06T00:01:00Z'}];
  importCatalogEntry(corrected,root);
  const loaded=loadCatalogSources(root).plugins[0];
  assert.deepEqual(loaded.releases[1].compatibilityCorrections,corrected.releases[1].compatibilityCorrections);
  assert.deepEqual(loaded.releases[1].packages,catalog.plugins[0].releases[1].packages);
});

test('publisher catches up multiple versions, validates uploaded bytes, and entry generation does not register early', {skip:process.platform==='win32'}, t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'oxideterm-catalog-publisher-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const directory of ['scripts','registry/plugins','fixtures','bin','plugins/demo']) fs.mkdirSync(path.join(root,directory),{recursive:true});
  for(const name of ['sync-catalog.mjs','catalog-source.mjs','release-plugin.mjs','validate-registry.mjs']) fs.copyFileSync(new URL(name,import.meta.url),path.join(root,'scripts',name));
  fs.copyFileSync(new URL('../registry/categories.json',import.meta.url),path.join(root,'registry/categories.json'));
  freezeV1(path.join(root,'registry'),{version:1,plugins:[]});
  fs.symlinkSync(path.resolve(import.meta.dirname,'../node_modules'),path.join(root,'node_modules'),'dir');
  const repository='example/plugins';
  let producer={version:1,plugins:[]};
  const releases=[];
  function publish(version, day) {
    const tag=`demo-v${version}`;
    const directory=path.join(root,'fixtures',tag);
    fs.mkdirSync(directory,{recursive:true});
    const manifest={id:'com.example.demo',name:'Demo',version,engines:{oxideterm:'>=2.0.0'},tags:['utilities']};
    const file=path.join(directory,`demo-${version}-any.zip`);
    fs.writeFileSync(file,zipSync({'plugin.json':strToU8(JSON.stringify(manifest)),'payload.txt':strToU8('payload-unchanged')},{level:0}));
    producer=recordRelease(producer,manifest,`https://github.com/${repository}/releases/download/${tag}`,[`any=${file}`]);
    const entry=producer.plugins[0];
    fs.writeFileSync(path.join(directory,'catalog-entry.json'),JSON.stringify(entry));
    releases.unshift({tag_name:tag,draft:false,prerelease:false,published_at:`2026-10-${day}T00:00:00Z`,assets:fs.readdirSync(directory).map(name=>({name,size:fs.statSync(path.join(directory,name)).size,browser_download_url:`https://github.com/${repository}/releases/download/${tag}/${name}`}))});
    fs.writeFileSync(path.join(root,'fixtures/releases.json'),JSON.stringify(releases));
    return {manifest,file};
  }
  publish('1.0.0','01');
  publish('2.0.0','02');
  const gh=path.join(root,'bin/gh');
  fs.writeFileSync(gh,`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),root=process.env.CATALOG_FIXTURE;
if(args[0]==='api') process.stdout.write(args[1].endsWith('page=1')?fs.readFileSync(path.join(root,'fixtures/releases.json')):'[]');
else if(args[0]==='release'&&args[1]==='download') fs.copyFileSync(path.join(root,'fixtures',args[2],args[args.indexOf('--pattern')+1]),path.join(args[args.indexOf('--dir')+1],args[args.indexOf('--pattern')+1]));
else throw new Error('Unexpected gh command');
`,{mode:0o755});
  const environment={...process.env,CATALOG_FIXTURE:root,PATH:path.join(root,'bin')+path.delimiter+process.env.PATH};
  const sync=(...args)=>execFileSync(process.execPath,[path.join(root,'scripts/sync-catalog.mjs'),'--repository',repository,...args],{env:environment,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.match(sync('--dry-run'),/Verified 2 unpublished/);
  assert.deepEqual(fs.readdirSync(path.join(root,'registry/plugins')),[]);
  assert.match(sync(),/Imported 2 unpublished/);
  const saved=loadCatalogSources(path.join(root,'registry/plugins'));
  assert.deepEqual(saved.plugins[0].releases.map(record=>record.version),['1.0.0','2.0.0']);
  assert.equal(saved.plugins[0].version,'1.0.0');
  assert.match(sync(),/Imported 0 unpublished/);
  execFileSync('git',['init'],{cwd:root,stdio:'ignore'});
  execFileSync('git',['config','user.name','Catalog test'],{cwd:root});
  execFileSync('git',['config','user.email','catalog-test@example.invalid'],{cwd:root});
  execFileSync('git',['config','commit.gpgsign','false'],{cwd:root});
  execFileSync('git',['add','registry'],{cwd:root});
  execFileSync('git',['commit','--no-verify','-m','Published v2 fixture'],{cwd:root,stdio:'ignore'});
  const baseline=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const validate=()=>execFileSync(process.execPath,[path.join(root,'scripts/validate-registry.mjs')],{cwd:root,env:{...environment,REGISTRY_BASE_REF:baseline},encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.match(validate(),/Validated 1 OxideTerm plugin entries/);
  const publishedSummary=JSON.parse(fs.readFileSync(path.join(root,'registry/v2/index.json'))).plugins[0];
  const historyFile=path.join(root,'registry/v2/plugins',publishedSummary.id,publishedSummary.history.checksum.slice('sha256:'.length)+'.json');
  const historicalBytes=fs.readFileSync(historyFile);
  fs.rmSync(historyFile);
  assert.throws(validate,/Published v2 history artifacts cannot be deleted/);
  fs.writeFileSync(historyFile,historicalBytes);
  const originalSource=fs.readFileSync(path.join(root,'registry/plugins/com.example.demo/releases/2.0.0.json'));
  const changedSource=JSON.parse(originalSource);
  changedSource.release.packages[0].checksum='sha256:'+'b'.repeat(64);
  fs.writeFileSync(path.join(root,'registry/plugins/com.example.demo/releases/2.0.0.json'),JSON.stringify(changedSource));
  assert.throws(validate,/published release changed or removed/);
  fs.writeFileSync(path.join(root,'registry/plugins/com.example.demo/releases/2.0.0.json'),originalSource);
  const v1File=path.join(root,'registry/v1/index.json');
  const frozen=fs.readFileSync(v1File);
  fs.appendFileSync(v1File,'\n');
  fs.writeFileSync(path.join(root,'registry/v1/index.sha256'),createHash('sha256').update(fs.readFileSync(v1File)).digest('hex')+'\n');
  assert.throws(validate,/Frozen v1 catalog differs from the previous commit/);
  fs.writeFileSync(v1File,frozen);
  fs.writeFileSync(path.join(root,'registry/v1/index.sha256'),createHash('sha256').update(frozen).digest('hex')+'\n');
  const {manifest,file}=publish('3.0.0','03');
  fs.writeFileSync(path.join(root,'plugins/demo/plugin.json'),JSON.stringify(manifest));
  const output=path.join(root,'entry.json');
  execFileSync(process.execPath,[path.join(root,'scripts/release-plugin.mjs'),'entry',path.join(root,'plugins/demo'),'--release-url',`https://github.com/${repository}/releases/download/demo-v3.0.0`,'--packages-dir',path.dirname(file),'--output',output]);
  const entry=JSON.parse(fs.readFileSync(output));
  assert.deepEqual(entry.releases.map(record=>record.version),['1.0.0','2.0.0','3.0.0']);
  assert.equal(entry.releases[2].packages[0].checksum,'sha256:'+createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  assert.deepEqual(loadCatalogSources(path.join(root,'registry/plugins')),saved);
  const tampered=fs.readFileSync(file);
  const offset=tampered.indexOf('payload-unchanged');
  assert.ok(offset>0);
  tampered[offset]='x'.charCodeAt(0);
  fs.writeFileSync(file,tampered);
  assert.throws(()=>sync(),/checksum or size differs/);
  assert.deepEqual(loadCatalogSources(path.join(root,'registry/plugins')),saved);
});
