"""对已有ID列表和人工标注做算术，不查询资料或调用模型。"""
from pathlib import Path
import json

source = Path(__file__).with_name('已有名次与本节人工标注.json')
data = json.loads(source.read_text(encoding='utf-8'))
results = []
for case in data['cases']:
    gold = set(case['goldIds'])
    k = case['k']
    top = case['rankedIds'][:k]
    found = len(set(top) & gold)
    # 相关集合为空时不计算召回，另用无答案行为判据。
    recall = found / len(gold) if gold else None
    first = next((i for i, item in enumerate(top, 1) if item in gold), None)
    rr = 1 / first if first is not None else 0
    precision = found / k
    f1 = 2 * precision * recall / (precision + recall) if recall is not None and precision + recall else 0 if recall is not None else None
    value = {'id': case['id'], 'topIds': top, 'goldIds': sorted(gold), 'precisionAtK': precision, 'recallAtK': recall, 'reciprocalRankAtK': rr, 'f1AtK': f1}
    value['manualAgrees'] = all(value[key] == number for key, number in case['declaredManual'].items())
    results.append(value)
print(json.dumps({'scope': '同一Q1的两个已有条件，非不同题的MRR或系统质量', 'newRetrieval': 0, 'newModel': 0, 'results': results}, ensure_ascii=False, indent=2))
