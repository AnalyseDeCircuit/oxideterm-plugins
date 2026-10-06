import fs from 'node:fs';
import {migrateCatalog, generateCatalog, importCatalogEntry} from './catalog-source.mjs';
const [command, file] = process.argv.slice(2);
if (command === 'migrate') migrateCatalog(JSON.parse(fs.readFileSync(file ?? 'registry/v1/index.json')));
else if (command === 'generate') generateCatalog();
else if (command === 'check') generateCatalog({check:true});
else if (command === 'import' && file) { importCatalogEntry(JSON.parse(fs.readFileSync(file))); generateCatalog(); }
else throw new Error('Use catalog.mjs migrate [index] | generate | check | import <entry>');
console.log(`Catalog ${command} complete`);
