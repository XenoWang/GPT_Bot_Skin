// Parse real ECMAScript module requests. Do not treat comments/template strings as imports.
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(process.argv[2]),records=[];
async function visit(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())await visit(file);
  else if(entry.isFile()&&entry.name.endsWith('.mjs')){
   const parsed=new vm.SourceTextModule(await readFile(file,'utf8'),{identifier:file});
   const specifiers=parsed.moduleRequests?parsed.moduleRequests.map(request=>request.specifier):parsed.dependencySpecifiers;
   records.push({file:path.relative(root,file),specifiers:[...new Set(specifiers)]});
  }
 }
}
await visit(root);
console.log(JSON.stringify(records));
