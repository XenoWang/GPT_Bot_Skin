// Read-only diagnostics, used only if the actual CLI does not emit its required JSON.
import path from 'node:path';
import {realpathSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
const details={argv:process.argv,cwd:process.cwd()};
if(process.argv[1]){
 details.resolved=path.resolve(process.argv[1]);
 try{details.real=realpathSync(process.argv[1]);details.moduleURL=pathToFileURL(details.real).href;details.urlPath=fileURLToPath(details.moduleURL);details.guardWouldMatch=details.resolved===details.urlPath;}catch(error){details.error={code:error.code,message:error.message,resource:error.resource};}
}
console.error('ENTRY_DIAGNOSTICS '+JSON.stringify(details));
