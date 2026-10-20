import {pathToFileURL} from 'node:url';
import path from 'node:path';

// 调用已有初始化用例；不改章稿，不建立模型或HTTP连接。
const [project, database, workId] = process.argv.slice(2);
const {seedPrototype} = await import(pathToFileURL(path.join(project, 'scripts/prototype-seed.mjs')).href);
console.log(JSON.stringify(await seedPrototype(database, workId)));
