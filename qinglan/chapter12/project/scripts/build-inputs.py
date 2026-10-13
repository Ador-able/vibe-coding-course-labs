"""将完整教师正文放入三页原件，保留不同文件表达及真实生成失败。"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
FILES = PUBLIC / "files"


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def native_file(destination, definition, note):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with pymupdf.open() as document:
        for page_number, (first, last) in enumerate(definition["pageParagraphs"], 1):
            page = document.new_page(width=595, height=842)
            page.insert_text((48, 45), definition["title"], fontname="china-s", fontsize=15)
            body = "\n\n".join(definition["paragraphs"][first:last + 1])
            remaining = page.insert_textbox(pymupdf.Rect(48, 76, 547, 690), body, fontname="china-s", fontsize=11, lineheight=1.65)
            if remaining < 0:
                raise RuntimeError(f"第{page_number}页完整正文未能放入；不删文或缩字。")
            if page_number == 3:
                if page.insert_textbox(pymupdf.Rect(48, 713, 547, 782), note, fontname="china-s", fontsize=10) < 0:
                    raise RuntimeError("完整编者便签未能放入。")
            page.insert_text((48, 813), f"第{page_number}页", fontname="china-s", fontsize=9)
        document.set_metadata({"title": definition["title"], "author": "课堂教师材料"})
        document.save(destination, garbage=4, deflate=True)


def main():
    if pymupdf.__version__ != "1.27.2.2":
        raise RuntimeError("请使用requirements.txt固定的PyMuPDF版本。")
    definition = json.loads((ROOT / "inputs/完整资料与问题.json").read_text(encoding="utf-8"))
    source = (ROOT / "inputs/井房里的铜杆-完整正文.txt").read_bytes()
    text = source.decode("utf-8")
    if text.rstrip("\n") != "\n\n".join(definition["paragraphs"]):
        raise RuntimeError("教师全文与完整25段定义不同。")
    if any(FILES.rglob("*.pdf")):
        raise RuntimeError("原件已存在；不能覆盖已生成的输入。")
    fixtures = [
        {"key": "native-v1", "label": "完整文字版", "path": "files/v1/井房里的铜杆.pdf", "docId": "qinglan-wellroom", "expectedPhysicalPages": 3},
        {"key": "scanned-v1", "label": "第二页为扫描图", "path": "files/scanned/井房里的铜杆.pdf", "docId": "qinglan-wellroom", "expectedPhysicalPages": 3},
        {"key": "native-v2", "label": "同名文件，便签更新", "path": "files/v2/井房里的铜杆.pdf", "docId": "qinglan-wellroom", "expectedPhysicalPages": 3},
        {"key": "broken", "label": "无法打开的文件", "path": "files/broken/井房里的铜杆.pdf", "docId": "qinglan-broken", "expectedPhysicalPages": None},
    ]
    native = PUBLIC / fixtures[0]["path"]
    native_file(native, definition, definition["questions"]["teacherNoteV1"])
    mixed = PUBLIC / fixtures[1]["path"]
    mixed.parent.mkdir(parents=True, exist_ok=True)
    with pymupdf.open(native) as original, pymupdf.open() as document:
        document.insert_pdf(original, from_page=0, to_page=0)
        page = document.new_page(width=595, height=842)
        page.insert_image(page.rect, stream=original[1].get_pixmap(dpi=288, alpha=False).tobytes("png"))
        document.insert_pdf(original, from_page=2, to_page=2)
        document.set_metadata({"title": definition["title"], "author": "课堂教师材料"})
        document.save(mixed, garbage=4, deflate=True)
    native_file(PUBLIC / fixtures[2]["path"], definition, definition["questions"]["teacherNoteV2"])
    broken = PUBLIC / fixtures[3]["path"]
    broken.parent.mkdir(parents=True, exist_ok=True)
    broken.write_bytes(b"This is a classroom fixture, not a PDF.\n")
    for fixture in fixtures:
        value = (PUBLIC / fixture["path"]).read_bytes()
        fixture.update(fileName="井房里的铜杆.pdf", fileBytes=len(value), fileSha256=sha256(value))
    catalog = {"generatedAt": datetime.now(timezone.utc).isoformat(), "generator": f"PyMuPDF {pymupdf.__version__}", "renderDpi": 288,
               "provenance": definition["origin"], "adopted": definition["adopted"],
               "sourceFile": {"name": "井房里的铜杆-完整正文.txt", "bytes": len(source), "sha256": sha256(source)}, "fixtures": fixtures}
    (PUBLIC / "fixtures.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pages = []
    cursor = 0
    for number, (first, last) in enumerate(definition["pageParagraphs"], 1):
        body = "\n\n".join(definition["paragraphs"][first:last + 1])
        start = text.index(body, cursor)
        end = start + len(body)
        pages.append({"parentId": f"wellroom-page-{number}", "physicalPage": number, "body": body,
                      "bodyRange": {"start": start, "end": end, "positionUnit": "utf16"}, "fileSha256": fixtures[0]["fileSha256"]})
        cursor = end
    mapping = {"title": definition["title"], "bodySha256": sha256(source), "parentPages": pages, "sourceFile": catalog["sourceFile"], "sourceFixture": fixtures[0]}
    (PUBLIC / "source-document.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"generatedFiles": len(fixtures), "bodySha256": sha256(source), "modelCalls": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
