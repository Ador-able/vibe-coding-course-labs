"""用成熟PDF组件生成固定的格式比较材料，不运行OCR或模型。"""

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
FILES = PUBLIC / "files"
SOURCE = ROOT / "inputs" / "小说第三章完整原文.txt"
DEFINITION = ROOT / "inputs" / "完整分页内容与教师便签.json"


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def repo_head():
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def write_native(destination, definition, note):
    with pymupdf.open() as document:
        for item in definition["pages"]:
            page = document.new_page(width=595, height=842)
            page.insert_text((48, 45), definition["pageHeading"], fontname="china-s", fontsize=15)
            remaining = page.insert_textbox(
                pymupdf.Rect(48, 76, 547, 690), item["text"],
                fontname="china-s", fontsize=11, lineheight=1.65,
            )
            if remaining < 0:
                raise RuntimeError(f"第{item['physicalPage']}页正文未能全部放入；保留此次失败，不缩字或删文。")
            if item["physicalPage"] == 3:
                remaining = page.insert_textbox(pymupdf.Rect(48, 713, 547, 782), note, fontname="china-s", fontsize=10)
                if remaining < 0:
                    raise RuntimeError("编者便签未能全部放入。")
            page.insert_text((48, 813), f"第{item['physicalPage']}页", fontname="china-s", fontsize=9)
        document.set_metadata({"title": definition["title"], "author": "课堂练习"})
        document.save(destination, garbage=4, deflate=True)


def main():
    if pymupdf.__version__ != "1.27.2.2":
        raise RuntimeError("请使用requirements.txt固定的PyMuPDF版本。")
    if FILES.exists():
        raise RuntimeError("文件材料目录已存在；不覆盖一次真实生成的原件。")
    definition = json.loads(DEFINITION.read_text(encoding="utf-8"))
    source = SOURCE.read_bytes()
    expected = definition["sourceFile"]
    if len(source) != expected["bytes"] or sha256(source) != expected["sha256"]:
        raise RuntimeError("完整小说原字节与材料定义不同。")
    reconstructed = "\n\n".join(item["text"] for item in definition["pages"])
    if reconstructed.encode("utf-8") != source:
        raise RuntimeError("分页遗漏、重写或重复了原文。")
    head = repo_head()
    for fixture in definition["intendedFixtures"]:
        (PUBLIC / fixture["path"]).parent.mkdir(parents=True, exist_ok=True)
    native = PUBLIC / definition["intendedFixtures"][0]["path"]
    mixed = PUBLIC / definition["intendedFixtures"][1]["path"]
    changed = PUBLIC / definition["intendedFixtures"][2]["path"]
    broken = PUBLIC / definition["intendedFixtures"][3]["path"]
    write_native(native, definition, definition["teacherNotes"]["nativeV1"])
    with pymupdf.open(native) as original, pymupdf.open() as document:
        document.insert_pdf(original, from_page=0, to_page=0)
        image = original[1].get_pixmap(dpi=144, alpha=False).tobytes("png")
        page = document.new_page(width=595, height=842)
        page.insert_image(page.rect, stream=image)
        document.insert_pdf(original, from_page=2, to_page=2)
        document.set_metadata({"title": definition["title"], "author": "课堂练习"})
        document.save(mixed, garbage=4, deflate=True)
    write_native(changed, definition, definition["teacherNotes"]["nativeV2"])
    broken.write_bytes(b"This is a classroom fixture, not a PDF.\n")
    fixtures = []
    for item in definition["intendedFixtures"]:
        value = (PUBLIC / item["path"]).read_bytes()
        fixtures.append({**item, "fileName": Path(item["path"]).name, "fileBytes": len(value), "fileSha256": sha256(value)})
    catalog = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatorGitHead": head, "generator": f"PyMuPDF {pymupdf.__version__}",
        "provenance": "教师构造文件表达，复用完整历史小说正文；不是新模型生成或文学采用。",
        "sourceFile": expected, "fixtures": fixtures,
    }
    (PUBLIC / "fixtures.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(catalog, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
