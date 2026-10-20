"""用 Hugging Face 的 Rust 实现独立生成小规模核对样本。"""
import json
from pathlib import Path
import tokenizers

root = Path(__file__).resolve().parents[1]
texts = [
    '你好，世界！',
    'Hello, world!',
    '1234567890',
    'const total = price * 2;',
    '龘🙂',
    'Hello\n  world\t!',
    'cafe\u0301',
    '<|endoftext|>你好',
    '<｜end▁of▁sentence｜>你好',
    '',
]
output = {'engine': f'Python tokenizers {tokenizers.__version__}（Rust 核心）', 'cases': []}
for key in ['qwen3', 'deepseek-v3']:
    tokenizer = tokenizers.Tokenizer.from_file(str(root / 'public' / 'tokenizers' / key / 'tokenizer.json'))
    for text in texts:
        encoded = tokenizer.encode(text, add_special_tokens=False)
        output['cases'].append({
            'model': key, 'text': text, 'ids': encoded.ids, 'tokens': encoded.tokens,
            'decoded': tokenizer.decode(encoded.ids, skip_special_tokens=False),
        })
(root / 'test').mkdir(exist_ok=True)
(root / 'test' / 'reference.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'engine': output['engine'], 'cases': len(output['cases'])}, ensure_ascii=False))
