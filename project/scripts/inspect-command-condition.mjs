// 同一短程序分别交给普通管道和 PTY，条件由实际进程报告。
console.log(JSON.stringify({
  pid:process.pid,
  cwd:process.cwd(),
  stdinIsTTY:process.stdin.isTTY===true,
  stdoutIsTTY:process.stdout.isTTY===true,
  lessonRun:process.env.LESSON_RUN_ID??null,
}));
