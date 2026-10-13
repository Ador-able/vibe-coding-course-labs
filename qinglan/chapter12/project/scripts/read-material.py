"""读取每个原件的页、文字与版式块，完整保留缺口及原页图像。"""

import hashlib
import json
import platform
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
PROFILE = "PyMuPDF/1.27.2.2;text-sort=true;blocks-sort=true;visible-page;render-dpi=288"


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def error_value(error):
    return {"type": type(error).__name__, "message": str(error)}


def read_one(fixture, destination):
    file_bytes = (PUBLIC / fixture["path"]).read_bytes()
    if len(file_bytes) != fixture["fileBytes"] or sha256(file_bytes) != fixture["fileSha256"]:
        raise RuntimeError("原文件改变；本次不能借用目录里的旧版本标识。")
    result = {
        "fixtureKey": fixture["key"], "label": fixture["label"],
        "docId": fixture["docId"], "fileName": fixture["fileName"],
        "filePath": fixture["path"], "fileBytes": len(file_bytes),
        "fileSha256": sha256(file_bytes), "parseProfile": PROFILE,
        "startedAt": now(), "openStatus": "pending", "pageCount": None,
        "pages": [], "error": None, "pdfMetadata": None,
        "teacherExpectedPages": fixture["expectedPhysicalPages"],
        "sourceReview": "尚需对原页核对，不由解析结束认证完整含义。",
    }
    try:
        with pymupdf.open(stream=file_bytes, filetype="pdf") as document:
            if document.needs_pass:
                raise RuntimeError("原件需要密码，未读取正文。")
            result["openStatus"] = "opened"
            result["pageCount"] = document.page_count
            result["pdfMetadata"] = document.metadata
            for index in range(document.page_count):
                physical_page = index + 1
                record = {
                    "physicalPage": physical_page, "pdfPageLabel": None,
                    "text": None, "textState": "pending", "blocks": [],
                    "rawBlocks": None, "textError": None,
                    "imagePath": None, "imageError": None,
                    "width": None, "height": None, "rotation": None,
                    "referencedImageCount": None,
                }
                try:
                    page = document[index]
                    record.update(pdfPageLabel=page.get_label(), width=page.rect.width, height=page.rect.height, rotation=page.rotation, referencedImageCount=len(page.get_images(full=True)))
                    text = page.get_text("text", sort=True)
                    raw_blocks = page.get_text("blocks", sort=True)
                    record["text"] = text
                    record["rawBlocks"] = raw_blocks
                    record["textState"] = "text-extracted" if text.strip() else "empty-text"
                    for block in raw_blocks:
                        if block[6] != 0:
                            continue
                        block_no = block[5]
                        locator = {"docId": result["docId"], "fileSha256": result["fileSha256"], "parseProfile": PROFILE, "physicalPage": physical_page, "blockNo": block_no}
                        anchor = sha256(json.dumps(locator, ensure_ascii=False, sort_keys=True).encode("utf-8"))
                        record["blocks"].append({"anchorId": anchor, "locator": locator, "bbox": list(block[:4]), "text": block[4], "textSha256": sha256(block[4].encode("utf-8"))})
                except Exception as error:
                    record["textState"] = "read-error"
                    record["textError"] = error_value(error)
                # 即使这一页没有文字，也单独保留原页，不让页号移动。
                try:
                    page = document[index]
                    image_file = destination / fixture["key"] / f"page-{physical_page}.png"
                    image_file.parent.mkdir(parents=True, exist_ok=True)
                    page.get_pixmap(dpi=288, alpha=False).save(image_file)
                    record["imagePath"] = image_file.relative_to(PUBLIC).as_posix()
                except Exception as error:
                    record["imageError"] = error_value(error)
                result["pages"].append(record)
    except Exception as error:
        result["openStatus"] = "open-error" if result["openStatus"] == "pending" else "document-error"
        result["error"] = error_value(error)
    result["finishedAt"] = now()
    result["gaps"] = [
        {"physicalPage": page["physicalPage"], "textState": page["textState"], "textError": page["textError"], "imageError": page["imageError"]}
        for page in result["pages"]
        if page["textState"] != "text-extracted" or page["imageError"] is not None
    ]
    result["bodySections"] = [{"physicalPage": page["physicalPage"], "textState": page["textState"], "text": page["text"]} for page in result["pages"]]
    return result


def main():
    if pymupdf.__version__ != "1.27.2.2":
        raise RuntimeError("请使用requirements.txt固定的PyMuPDF版本。")
    catalog = json.loads((PUBLIC / "fixtures.json").read_text(encoding="utf-8"))
    run_id = str(uuid.uuid4())
    destination = PUBLIC / "pages" / run_id
    destination.mkdir(parents=True)
    observation = {
        "runId": run_id, "startedAt": now(),
        "gitHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "pythonVersion": platform.python_version(), "pymupdfVersion": pymupdf.__version__,
        "parseProfile": PROFILE, "inputCatalog": catalog,
        "operation": "四个固定文件各打开一次，提取文字/版式块并渲染原页；没有OCR、模型调用、向量库或索引更新。",
        "documents": [],
    }
    for fixture in catalog["fixtures"]:
        observation["documents"].append(read_one(fixture, destination))
    observation["finishedAt"] = now()
    data = (json.dumps(observation, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (destination / "observation.json").write_bytes(data)
    # 页面只消费这份原样记录，切换版式不会再次打开PDF。
    (PUBLIC / "records" / "reading.json").write_bytes(data)
    print(json.dumps({"runId": run_id, "recordPath": (destination / "observation.json").relative_to(ROOT).as_posix(), "recordBytes": len(data), "recordSha256": sha256(data), "files": len(observation["documents"]), "openStatuses": [item["openStatus"] for item in observation["documents"]]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
