import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'inputs/日历完整待执行提案.json'), 'utf8'));
const local = (value, timeZone) => new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
const start = new Date(proposal.start.dateTime);
const end = new Date(proposal.end.dateTime);
assert.equal((end - start) / 60000, 30);
assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: proposal.start.timeZone, weekday: 'long' }).format(start), 'Monday');
const result = {
  kind: 'actual-local-iana-calculation-no-calendar-request',
  engine: { node: process.version, icu: process.versions.icu, tz: process.versions.tz },
  classroomDate: '2026-10-15',
  startUtc: start.toISOString(), endUtc: end.toISOString(), durationMinutes: 30,
  organizer: { timeZone: proposal.start.timeZone, start: local(proposal.start.dateTime, proposal.start.timeZone), end: local(proposal.end.dateTime, proposal.end.timeZone) },
  contact: { timeZone: proposal.contact.timeZone, start: local(proposal.start.dateTime, proposal.contact.timeZone), end: local(proposal.end.dateTime, proposal.contact.timeZone) },
  proposalKind: proposal.kind, busyCheck: proposal.busyCheck, allowedActionNow: proposal.allowedActionNow,
  googleRequests: 0, eventCreations: 0, invitations: 0, modelRequests: 0,
};
const destination = process.argv[2];
if (destination) {
  if (fs.existsSync(destination)) throw new Error('计算记录已存在；使用新的记录路径。');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
