import {spawnSync} from 'node:child_process';
const result=spawnSync('npm',['run','build'],{cwd:new URL('../web',import.meta.url),stdio:'inherit',shell:process.platform==='win32'});process.exit(result.status??1);
