from pathlib import Path
import csv
import hashlib
import json
import os
import sys

root = Path(__file__).resolve().parents[1]
mode, input_name, output_name = sys.argv[1:]
if mode not in ('export', 'readback'):
    raise ValueError('请选择 export 或 readback')
input_path = root / input_name
output = root / output_name
reference = json.loads((root / 'inputs/抽取-独立参考.json').read_text(encoding='utf-8'))
columns = reference['csv']['columns']
numbers = set(reference['numericFields'])
receipt = {'mode': mode, 'processId': os.getpid(), 'pythonVersion': sys.version.split()[0], 'modelCalls': 0,
           'source': str(input_path.relative_to(root)), 'scope': '候选业务字段完整往返，不修复证据、汇总或作采用决定'}

def write_new(name, value):
    with (output / name).open('x', encoding='utf-8', newline='') as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write('\n')

try:
    candidate = json.loads(input_path.read_text(encoding='utf-8'))
    rows = candidate['records']
    if not isinstance(rows, list) or not rows:
        raise ValueError('没有完整候选记录')
    if len({row.get('sourceId') for row in rows}) != len(rows):
        raise ValueError('来源ID重复')
    for row in rows:
        if set(row) != set(columns + ['evidence']):
            raise ValueError('业务列或evidence结构不符')
        for key in columns:
            value = row[key]
            if key in numbers:
                if value is not None and (type(value) is not int or value < 0):
                    raise ValueError(key + '应为非负整数或null')
            elif key == 'duplicateOf':
                if value is not None and not isinstance(value, str):
                    raise ValueError('重复来源应为字符串或null')
            elif not isinstance(value, str):
                raise ValueError(key + '应为字符串')
        if not row['group']:
            raise ValueError('人群范围不得为空')
    wanted = [{key: row[key] for key in columns} for row in rows]
    if mode == 'export':
        output.mkdir(parents=True, exist_ok=True)
        with (output / 'candidate.csv').open('x', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=columns, lineterminator='\n')
            writer.writeheader()
            writer.writerows(wanted)
        receipt.update(state='exported', rows=len(wanted), columns=columns)
    else:
        with (output / 'candidate.csv').open('r', encoding='utf-8', newline='') as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != columns:
                raise ValueError('CSV列不符')
            restored = []
            for row in reader:
                if set(row) != set(columns) or any(value is None for value in row.values()):
                    raise ValueError('CSV行列不符')
                for key in numbers | {'duplicateOf'}:
                    if row[key] == '':
                        row[key] = None
                    elif key in numbers:
                        row[key] = int(row[key])
                restored.append(row)
        if restored != wanted:
            raise ValueError('独立进程读回与完整候选业务值不同')
        receipt.update(state='passed', rows=len(restored), columns=columns, restoredRows=restored)
    raw = (output / 'candidate.csv').read_bytes()
    receipt.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
except Exception as error:
    output.mkdir(parents=True, exist_ok=True)
    receipt.update(state='failed', error={'name': type(error).__name__, 'message': str(error)})
write_new('csv-' + mode + '.json', receipt)
print(json.dumps({key: value for key, value in receipt.items() if key != 'restoredRows'}, ensure_ascii=False))
if receipt['state'] == 'failed':
    sys.exit(1)
