import { startCourseServer } from './server.ts';

startCourseServer().catch(error => {
  console.error(`实验启动失败：${error.message}`);
  process.exitCode = 1;
});
