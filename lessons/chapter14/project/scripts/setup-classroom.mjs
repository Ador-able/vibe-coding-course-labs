import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { configPath, exchange } from '../src/native-rest.mjs';
import { checkSource } from '../src/source.mjs';

if(process.argv[2]!=='create'){console.log('教师隔离课堂：node scripts/setup-classroom.mjs create。读者个人账户使用 n8n 标准 UI 一次准备。');process.exit(0);}
await checkSource();
const accountPath=path.join(path.dirname(configPath),'fanren-n8n-ch14-account.json');
try{await fs.access(configPath);throw new Error('本机课堂配置已存在；不创建第二套账户。');}catch(error){if(error.code!=='ENOENT')throw error;}
try{await fs.access(accountPath);throw new Error('账户准备原件已存在；先核本机实际状态，不重复 setup。');}catch(error){if(error.code!=='ENOENT')throw error;}
const baseUrl='http://localhost:5689';
const account={kind:'synthetic-local-classroom-account',baseUrl,email:'fanren-'+randomUUID()+'@example.com',firstName:'凡人',lastName:'课堂',password:'Fanren9A'+randomBytes(20).toString('base64url')};
await fs.mkdir(path.dirname(accountPath),{recursive:true});await fs.writeFile(accountPath,JSON.stringify(account,null,2)+'\n');
const setup=await exchange(baseUrl,'/rest/owner/setup','POST',JSON.stringify({email:account.email,firstName:account.firstName,lastName:account.lastName,password:account.password}));
if(setup.record.status>=400)throw new Error('原生账户 setup 未通过；私密原件已保留，不自动重试。');
const login=await exchange(baseUrl,'/rest/login','POST',JSON.stringify({emailOrLdapLoginId:account.email,password:account.password}));
if(login.record.status>=400)throw new Error('原生登录未通过；私密原件已保留。');
const cookie=login.cookies.map(s=>s.split(';')[0]).join('; ');
if(!cookie)throw new Error('原生登录没有返回会话 Cookie。');
const scopes=['dataTable:create','dataTable:read','dataTable:list','dataTableRow:read','workflow:create','workflow:read','workflow:update','workflow:activate','workflow:deactivate','execution:read','execution:list'];
const key=await exchange(baseUrl,'/rest/api-keys','POST',JSON.stringify({label:'凡人第十四章课堂',scopes,expiresAt:null}),{Cookie:cookie});
if(key.record.status>=400)throw new Error('原生 API key 创建未通过；私密原件已保留。');
const apiKey=key.record.body?.data?.rawApiKey;
if(typeof apiKey!=='string'||!apiKey)throw new Error('原生 API key 返回缺少 rawApiKey；完整响应仅留私密目录。');
await fs.writeFile(configPath,JSON.stringify({baseUrl,apiKey},null,2)+'\n');
console.log(JSON.stringify({created:true,syntheticClassroomOnly:true,configPath,accountPath,accountDetailsExported:false,modelRequests:0}));
