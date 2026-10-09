import hashlib
import json
import sqlite3
from pathlib import Path

unit = Path(__file__).resolve().parent
run = unit / 'lab/runs/mcp-two-03ba0552-8582-4dbf-9deb-8412b9f005ac'
read = lambda name: json.loads((run / name).read_text(encoding='utf-8'))
protocol_checks = []
for label in ['正常连接', '断连', '调用者异常']:
    events = read(label + '-协议.json')
    calls = read(label + '-调用.json')
    requests = {event['message']['id']: event['message'] for event in events
                if event['type'] == 'send' and 'id' in event['message']}
    responses = {event['message']['id']: event['message'] for event in events
                 if event['type'] == 'receive'}
    tool_pairs = []
    for request_id, request in requests.items():
        response = responses[request_id]
        assert request['jsonrpc'] == response['jsonrpc'] == '2.0'
        if request['method'] == 'initialize':
            assert request['params']['protocolVersion'] == response['result']['protocolVersion'] == '2025-11-25'
        if request['method'] == 'tools/call':
            tool_pairs.append((request['params'], response['result']))
    returned_calls = [call for call in calls if 'returned' in call]
    assert len(tool_pairs) == len(returned_calls)
    for (params, result), call in zip(tool_pairs, returned_calls):
        assert params == {'name': call['name'], 'arguments': call['arguments']}
        assert result == call['returned']
    assert events[-1]['type'] == 'close.end' and events[-1]['pid'] is None
    protocol_checks.append({'label': label, 'events': len(events), 'complete_tool_pairs': len(tool_pairs),
                            'thrown_calls': [call for call in calls if 'thrown' in call]})

normal = read('正常连接-调用.json')
assert [call['name'] for call in normal] == ['read_work', 'save_draft', 'save_draft', 'save_draft', 'read_work', 'save_draft']
saved = normal[1]['returned']['structuredContent']['result']
assert saved == read('CLI完整读回.json')
assert saved['body'] == normal[1]['arguments']['body']
assert saved['revision'] == 2 and saved['status'] == 'draft'
assert saved['origin'] == 'agent' and saved['taskId'] is None and saved['threadId'] is None
assert json.loads(normal[2]['returned']['content'][0]['text'])['code'] == 'STALE_CHAPTER'
assert normal[3]['returned']['isError'] is True
assert 'chapterNumber' in normal[3]['returned']['content'][0]['text']
assert json.loads(normal[4]['returned']['content'][0]['text'])['code'] == 'WORK_NOT_FOUND'
assert json.loads(normal[5]['returned']['content'][0]['text'])['message'] == '正文已是 r3，请重读后合并。'

database = run / 'novel.sqlite'
before_hash = hashlib.sha256(database.read_bytes()).hexdigest()
db = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
try:
    tables = {}
    for table, order in [('works', 'id'), ('work_versions', 'work_id, revision'),
                         ('chapters', 'work_id, number'), ('chapter_versions', 'work_id, number, revision'),
                         ('tasks', 'id')]:
        rows = [dict(row) for row in db.execute(f'SELECT * FROM {table} ORDER BY {order}')]
        for row in rows:
            row['content'] = json.loads(row['content'])
        tables[table] = rows
finally:
    db.close()
after_hash = hashlib.sha256(database.read_bytes()).hexdigest()
assert tables == read('正常连接关闭后业务.json') == read('断连后业务.json') == read('全部连接结束后业务.json')
assert [len(tables[table]) for table in tables] == [1, 1, 1, 3, 0]
history = [row['content'] for row in tables['chapter_versions']]
assert [chapter['revision'] for chapter in history] == [1, 2, 3]
assert [chapter['origin'] for chapter in history] == ['human', 'agent', 'human']
assert history[1] == saved
assert history[2] == read('人工改稿.json') == tables['chapters'][0]['content']
assert history[2]['body'] == '【人工修改】林澈退后一步，等守塔人说明条件。'
assert all(row['number'] == 1 for row in tables['chapters'])
assert before_hash == after_hash
record = {
    'author_run': '03ba0552-8582-4dbf-9deb-8412b9f005ac',
    'codeVersion': read('运行输入.json')['codeVersion'], 'protocol_checks': protocol_checks,
    'actual_tables': tables, 'main_database_hash_before_readonly_query': before_hash,
    'main_database_hash_after_readonly_query': after_hash,
    'limits': ['纯官方 Client 中正文与参数均由人准备。origin agent 是 MCP 保存入口的固定标记。',
               '终止服务时没有待执行写入，不能推断运行中断会撤销已发生的写入。',
               '哈希只覆盖本次独立只读查询前后，不是整个 MCP 运行期间的文件字节断言。',
               '没有实跑 ChatCut、远程 HTTP、超时或付费模型调用。'],
}
(unit / '作者独立协议与只读业务核对.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'protocol': protocol_checks, 'tables': {key: len(value) for key, value in tables.items()},
                  'mainDBUnchangedDuringQuery': before_hash == after_hash}, ensure_ascii=False))
