"""按固定十一列导出真实候选，在另一个进程读回；不调用模型。"""
import csv
import hashlib
import json
import math
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parent
RUN = (ROOT / (sys.argv[2] if len(sys.argv) > 2 else 'comparison-runs/my-comparison-01')).resolve()
COLUMNS = ['sourceId', 'campaignId', 'date', 'title', 'status', 'impressions', 'clicks', 'subscriptions', 'spendCNY', 'budgetCNY', 'duplicateOf']
NUMBERS = ['impressions', 'clicks', 'subscriptions', 'spendCNY', 'budgetCNY']
NULL_COLUMNS = NUMBERS + ['duplicateOf']

def candidate(directory):
    value = json.loads((directory / 'output.txt').read_text(encoding='utf-8'))
    if not isinstance(value, dict) or set(value) != {'records', 'summary'} or not isinstance(value['records'], list):
        raise ValueError('候选顶层和记录结构不符，不能静默整理')
    if any(not isinstance(row, dict) for row in value['records']):
        raise ValueError('每条记录须为对象，完整原答保留不改写')
    if any(not isinstance(row.get('sourceId'), str) for row in value['records']):
        raise ValueError('sourceId须为字符串')
    if len(value['records']) != 10 or {r.get('sourceId') for r in value['records']} != {f'R{i:02}' for i in range(1, 11)}:
        raise ValueError('十项记录身份不完整')
    for row in value['records']:
        if set(row) != set(COLUMNS + ['evidence']):
            raise ValueError('业务字段或evidence遗漏/增加')
        if any(not isinstance(row[k], str) for k in COLUMNS[:5]):
            raise ValueError('文字字段类型不符')
        if row['status'] not in ('observed', 'planned'):
            raise ValueError('状态类型不符')
        for key in NUMBERS:
            number = row[key]
            if number is not None and (type(number) not in (int, float) or not math.isfinite(number) or number < 0 or (key in NUMBERS[:3] and (not isinstance(number, int) or isinstance(number, bool)))):
                raise ValueError(f'{key}不是规定数值或null')
        if row['duplicateOf'] is not None and not isinstance(row['duplicateOf'], str):
            raise ValueError('重复身份类型不符')
    return [{key: row[key] for key in COLUMNS} for row in value['records']]

def restore(csv_path):
    with csv_path.open('r', encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != COLUMNS:
            raise ValueError('列名称或顺序不符')
        rows = []
        for raw in reader:
            if set(raw) != set(COLUMNS) or any(v is None for v in raw.values()):
                raise ValueError('CSV列数不符')
            row = dict(raw)
            for key in NULL_COLUMNS:
                if row[key] == 'null':
                    row[key] = None
                elif key in NUMBERS[:3]:
                    row[key] = int(row[key])
                elif key in NUMBERS:
                    row[key] = float(row[key])
            rows.append(row)
        return rows

if len(sys.argv) not in (2, 3) or sys.argv[1] not in ('export', 'read-export'):
    raise SystemExit('用法：python comparison-csv.py export|read-export [结果目录]')
action = sys.argv[1]
outcomes = []
for version in ('V1', 'V2'):
    directory = RUN / version
    try:
        actual = candidate(directory)
        target = directory / 'candidate.csv'
        if action == 'export':
            with target.open('x', encoding='utf-8', newline='') as stream:
                writer = csv.writer(stream, quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
                writer.writerow(COLUMNS)
                writer.writerows(['null' if row[k] is None and k in NULL_COLUMNS else row[k] for k in COLUMNS] for row in actual)
            result = {'version': version, 'state': 'exported', 'csvBytes': target.stat().st_size, 'csvSHA256': hashlib.sha256(target.read_bytes()).hexdigest(), 'scope': '导出实际候选，不替换业务值或汇总；证据留在原JSON。'}
        else:
            restored = restore(target)
            if restored != actual:
                raise ValueError('完整十一列逐行读回与实际候选不相等')
            result = {'version': version, 'state': 'passed', 'rows': len(restored), 'columns': COLUMNS, 'restoredRows': restored, 'processId': os.getpid(), 'pythonVersion': sys.version, 'modelCalls': 0, 'semanticAdoption': False}
    except (ValueError, TypeError, KeyError, OSError) as error:
        result = {'version': version, 'state': 'failed', 'error': {'name': type(error).__name__, 'message': str(error)}, 'modelCalls': 0}
    output = directory / ('csv-export.json' if action == 'export' else 'csv-readback.json')
    with output.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    outcomes.append({k: result[k] for k in ('version', 'state')})
print(json.dumps({'action': action, 'processId': os.getpid(), 'outcomes': outcomes}, ensure_ascii=False))
