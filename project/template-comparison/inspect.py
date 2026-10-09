from pathlib import Path
import csv, io, json, hashlib, math, sys

root = Path(__file__).resolve().parent
run = root / 'runs' / 'extract-01'
source = json.loads((root / 'inputs/reports.json').read_text(encoding='utf-8'))
reference = json.loads((root / 'inputs/teacher-reference.json').read_text(encoding='utf-8'))
raw = (run / 'output.txt').read_text(encoding='utf-8')
result = {'scope': '只检查既有模型原件；CSV和正确统计使用请求前教师参考，不修改或采用模型失败结果', 'jsonValid': False, 'modelAccepted': False}
try:
    actual = json.loads(raw)
except (ValueError, TypeError) as exc:
    result['parseError'] = str(exc)
else:
    result['jsonValid'] = True
    expected = {x['sourceId']: x for x in reference['records']}
    inputs = {x['id']: x['text'] for x in source['records']}
    cols = reference['columns']
    rows = actual.get('records', [])
    result['actualRecordIds'] = [x.get('sourceId') for x in rows]
    result['allSourceIdsOnce'] = result['actualRecordIds'] == list(expected)
    result['valueComparisons'] = []
    result['evidenceChecks'] = []
    result['shapeChecks'] = []
    for row in rows:
        ident = row.get('sourceId')
        result['shapeChecks'].append({'sourceId': ident, 'keysMatch': set(row) == set(cols + ['evidence']), 'evidenceKeysMatch': set(row.get('evidence', {})) == set(cols[1:])})
        for col in cols:
            expected_value = expected[ident][col]
            got = row.get(col)
            result['valueComparisons'].append({'sourceId': ident, 'field': col, 'expected': expected_value, 'actual': got, 'equal': got == expected_value, 'judgment': '标题句号边界在原输入中不明确，差异须人确认；不自动判作事实错误' if col == 'title' and got != expected_value else '与请求前参考逐字段比较'})
        for field, quote in row.get('evidence', {}).items():
            allowed_empty = field in ['budgetCNY', 'duplicateOf'] and row[field] is None
            present = isinstance(quote, str) and len(quote) > 0 and quote in inputs[ident]
            result['evidenceChecks'].append({'sourceId': ident, 'field': field, 'quote': quote, 'exactSubstring': present, 'allowedNull': allowed_empty and quote is None, 'passed': present or (allowed_empty and quote is None)})
    result['summaryComparisons'] = []
    for field, expected_value in reference['summary'].items():
        got = actual.get('summary', {}).get(field)
        equal = math.isclose(got, expected_value, abs_tol=1e-6, rel_tol=0) if field == 'ctr' and isinstance(got, (int, float)) else got == expected_value
        result['summaryComparisons'].append({'field': field, 'expected': expected_value, 'actual': got, 'equal': equal})
    result['modelSummary'] = actual.get('summary')
    result['valueDifferences'] = [x for x in result['valueComparisons'] if not x['equal']]
    result['quoteFailures'] = [x for x in result['evidenceChecks'] if not x['passed']]
    result['summaryFailures'] = [x for x in result['summaryComparisons'] if not x['equal']]
    result['modelAccepted'] = result['allSourceIdsOnce'] and all(x['keysMatch'] and x['evidenceKeysMatch'] for x in result['shapeChecks']) and not result['valueDifferences'] and not result['quoteFailures'] and not result['summaryFailures']

# 教师参考是独立的演示输入；不是修过的模型回答。
rows = reference['records']
cols = reference['columns']
csv_dir = root / 'runs' / 'teacher-csv-01'
csv_dir.mkdir(parents=True, exist_ok=True)
csv_path = csv_dir / 'teacher-reference.csv'
with csv_path.open('w', encoding='utf-8', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=cols, lineterminator='\r\n')
    writer.writeheader()
    writer.writerows(rows)
with csv_path.open('r', encoding='utf-8', newline='') as handle:
    reader = csv.DictReader(handle)
    fields = reader.fieldnames
    loaded = list(reader)
integer_fields = {'impressions', 'clicks', 'subscriptions'}
money_fields = {'spendCNY', 'budgetCNY'}
restored = []
for row in loaded:
    converted = dict(row)
    for key in integer_fields | money_fields | {'duplicateOf'}:
        value = row[key]
        if value == '':
            converted[key] = None
        elif key in integer_fields:
            converted[key] = int(value)
        elif key in money_fields:
            number = float(value)
            converted[key] = int(number) if number.is_integer() else number
    restored.append(converted)
csv_bytes = csv_path.read_bytes()
result['teacherCSV'] = {'path': 'runs/teacher-csv-01/teacher-reference.csv', 'bytes': len(csv_bytes), 'sha256': hashlib.sha256(csv_bytes).hexdigest(), 'columns': fields, 'headerEqual': fields == cols, 'dataRows': len(loaded), 'fieldCounts': [len(x) for x in loaded], 'physicalLines': len(csv_bytes.decode('utf-8').splitlines()), 'fullValuesEqual': restored == rows, 'nullConvention': '数值列、duplicateOf空单元格按本练习契约读回null；0保持数值0；标题非空。CSV本身不附带这些类型。', 'restoredFullRows': restored}
assert fields == cols and restored == rows
observed = [x for x in rows if x['status'] == 'observed' and x['duplicateOf'] is None]
eligible = [x for x in observed if x['impressions'] is not None and x['impressions'] > 0 and x['clicks'] is not None]
num = sum(x['clicks'] for x in eligible)
den = sum(x['impressions'] for x in eligible)
subscriptions = [x for x in observed if x['subscriptions'] is not None]
calc = {
    'dataOrigin': '请求前冻结教师参考，非采用模型失败汇总',
    'rawSources': len(rows), 'uniqueCampaignDays': len([x for x in rows if x['duplicateOf'] is None]),
    'uniqueObservedSourceIds': [x['sourceId'] for x in observed],
    'ctrSourceIds': [x['sourceId'] for x in eligible],
    'ctrClicks': num, 'ctrImpressions': den, 'ctrFraction': str(num) + '/' + str(den),
    'ctr': num / den, 'ctrPercent': 100 * num / den,
    'rowCtrs': [{'sourceId': x['sourceId'], 'clicks': x['clicks'], 'impressions': x['impressions'], 'ctr': x['clicks']/x['impressions']} for x in eligible],
    'meanRowCtr': sum(x['clicks']/x['impressions'] for x in eligible) / len(eligible),
    'knownObservedClicksSourceIds': [x['sourceId'] for x in observed if x['clicks'] is not None],
    'knownObservedClicks': sum(x['clicks'] for x in observed if x['clicks'] is not None),
    'knownActualSpendCNY': sum(x['spendCNY'] for x in observed if x['spendCNY'] is not None),
    'knownSubscriptionEvents': sum(x['subscriptions'] for x in subscriptions),
    'knownSubscriptionSourceIds': [x['sourceId'] for x in subscriptions],
    'excludedForCTR': [
        {'sourceId': 'R02', 'reason': '同一日报重复转存，仅保留来源，不重复计入'},
        {'sourceId': 'R04', 'reason': '展示次数未知，20次点击不加入该CTR分子'},
        {'sourceId': 'R05', 'reason': '明确0展示，单行0/0未定义，不符合展示>0口径'},
        {'sourceId': 'R06', 'reason': '尚未投放，预计量和预算不是实际量'}
    ],
    'limits': ['仅这四条完整日报的总体点击/展示比例，不代表全部六条实际日报的整体CTR', '订阅只统计五条已知日报的事件次数，不是六条的完整合计或独立人数', '教师材料无真实投放、总体抽样或因果实验，不能推出标题效果']
}
assert num == 195 and den == 4300
assert calc['knownObservedClicks'] == 215 and calc['knownActualSpendCNY'] == 35 and calc['knownSubscriptionEvents'] == 10
result['teacherCalculation'] = calc
(csv_dir / 'restored-full-rows.json').write_text(json.dumps(restored, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
(csv_dir / 'calculation.json').write_text(json.dumps(calc, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
(root / 'runs' / 'inspection.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
print(json.dumps({'jsonValid': result['jsonValid'], 'modelAccepted': result['modelAccepted'], 'valueDifferences': result.get('valueDifferences'), 'quoteFailures': result.get('quoteFailures'), 'summaryFailures': result.get('summaryFailures'), 'teacherCSV': {k:v for k,v in result['teacherCSV'].items() if k != 'restoredFullRows'}, 'teacherCalculation': calc}, ensure_ascii=False, indent=2))

