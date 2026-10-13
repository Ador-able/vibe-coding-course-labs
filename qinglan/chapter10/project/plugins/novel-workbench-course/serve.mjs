import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// 绑定指向已构建的同一业务服务；插件不复制正文或维护第二个数据库。
const binding=JSON.parse(await readFile(new URL('./binding.json',import.meta.url),'utf8'));
process.argv=[process.execPath,binding.entry,binding.database,binding.taskId??'',...(binding.excerpt?[binding.excerpt]:[])];
await import(pathToFileURL(binding.entry).href);
