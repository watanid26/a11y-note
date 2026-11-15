#!/usr/bin/env python3
"""점검보고서 DOCX → PDF (LibreOffice UNO).

사용: python3 scripts/docx-to-pdf.py 점검보고서.docx 점검보고서.pdf

`soffice --convert-to pdf` 대신 쓰는 이유 (독립 심사 P1-5):
 - 제목 단계(Heading 1~3)로 PDF 책갈피를 만들고, 태그 PDF(/StructTreeRoot)와 문서 언어(/Lang)를 남긴다.
 - LibreOffice 는 DOCX 의 autoSpaceDE/autoSpaceDN(숫자·영문과 한글 사이 자동 간격) 끄기를 읽지 않아
   "11 개"처럼 숫자와 단위가 벌어진다. 모든 문단에서 이 간격(ParaIsCharacterDistance)을 끈 뒤 내보낸다.
글꼴: 맑은 고딕이 없는 환경이면 fontconfig 로 Noto Sans CJK KR 에 연결해 두는 것을 권장한다
(그렇지 않으면 중국어 간체(SC) 글리프로 대체될 수 있다).
"""
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


def off(obj):
    try:
        obj.setPropertyValue("ParaIsCharacterDistance", False)
    except Exception:
        pass


def walk(text):
    """본문·표 칸 안의 모든 문단"""
    en = text.createEnumeration()
    while en.hasMoreElements():
        el = en.nextElement()
        if el.supportsService("com.sun.star.text.TextTable"):
            for name in el.getCellNames():
                walk(el.getCellByName(name).getText())
        else:
            off(el)


def main():
    src, dst = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    port = 2002 + os.getpid() % 1000
    profile = tempfile.mkdtemp(prefix="lo-")
    proc = subprocess.Popen(
        ["soffice", "--headless", "--norestore", "--nologo", f"-env:UserInstallation=file://{profile}", f"--accept=socket,host=127.0.0.1,port={port};urp;"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = None
        for _ in range(60):
            try:
                ctx = resolver.resolve(f"uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext")
                break
            except Exception:
                time.sleep(0.5)
        if ctx is None:
            raise SystemExit("LibreOffice 연결 실패")
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        doc = desktop.loadComponentFromURL(src.as_uri(), "_blank", 0, (prop("Hidden", True),))
        styles = doc.getStyleFamilies().getByName("ParagraphStyles")
        for n in styles.getElementNames():
            off(styles.getByName(n))
        walk(doc.getText())
        pages = doc.getStyleFamilies().getByName("PageStyles")
        for n in pages.getElementNames():
            ps = pages.getByName(n)
            for k in ("HeaderText", "HeaderTextFirst", "FooterText", "FooterTextFirst"):
                try:
                    t = ps.getPropertyValue(k)
                    if t is not None:
                        walk(t)
                except Exception:
                    pass
        doc.refresh()
        flt = uno.Any("[]com.sun.star.beans.PropertyValue", tuple([prop("ExportBookmarks", True), prop("UseTaggedPDF", True), prop("ExportNotes", False)]))
        doc.storeToURL(dst.as_uri(), (prop("FilterName", "writer_pdf_Export"), prop("FilterData", flt)))
        doc.close(True)
    finally:
        try:
            desktop.terminate()
        except Exception:
            pass
        proc.wait(timeout=30)


if __name__ == "__main__":
    main()
