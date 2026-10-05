import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';
const root=path.resolve(import.meta.dirname,'..');
execFileSync('cargo',['build','--release','--locked','--target','wasm32-wasip1'],{cwd:root,stdio:'inherit'});
fs.copyFileSync(path.join(root,'target/wasm32-wasip1/release/plugin.wasm'),path.join(root,'plugin.wasm'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'plugin.json')));
if(process.argv.includes('--local')) {manifest.version+='-local.1';manifest.engines.oxideterm='>=2.2.0';}
const files={'plugin.json':strToU8(JSON.stringify(manifest,null,2)+'\n'),'plugin.wasm':fs.readFileSync(path.join(root,'target/wasm32-wasip1/release/plugin.wasm'))};
for(const name of ['LICENSE','README.md','README.en.md','locales.json']) files[name]=fs.readFileSync(path.join(root,name));
const metadata=JSON.parse(execFileSync('cargo',['metadata','--locked','--format-version','1','--filter-platform','wasm32-wasip1'],{cwd:root,encoding:'utf8'}));
let notices='';
for(const pkg of metadata.packages) {
  notices+=`\n${pkg.name} ${pkg.version}\n${pkg.license||''}\n`;
  const directory=path.dirname(pkg.manifest_path);
  for(const name of fs.readdirSync(directory).filter(name=>/^(LICENSE|COPYING|NOTICE|COPYRIGHT)([._-]|$)/i.test(name))) {
    const file=path.join(directory,name); if(fs.statSync(file).isFile()) notices+=fs.readFileSync(file,'utf8')+'\n';
  }
}
files['THIRD_PARTY_NOTICES.txt']=strToU8(notices);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
const output=path.join(root,'dist',`toolbox-${manifest.version}-any.zip`);
fs.writeFileSync(output,zipSync(files,{level:6}));
execFileSync(process.execPath,[path.join(import.meta.dirname,'verify.mjs'),output],{stdio:'inherit'});
console.log(output);
