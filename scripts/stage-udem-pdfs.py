#!/usr/bin/env python3
"""Stage provisional UdeM D.M.D. 2026-2027 data from the supplied PDFs. Read-only on the PDFs; writes one JSON file.
Usage: python3 scripts/stage-udem-pdfs.py <pdf-dir> [out.json]   (needs PyMuPDF)
Output is PROVISIONAL: never published without admin review. Timetable grids are NOT interpreted (weekday/time
geometry is lost in text); only the course lists are parsed into candidate rows and diffed against udem-dmd.json."""
import hashlib, json, re, sys, unicodedata, datetime
from pathlib import Path
import pymupdf

EXPECTED = [
 "Calendrier-facultaire-2026-2027-MAJ-26.08.06.pdf",
 *[f"DMD-2026A-Horaire_Semaine_integration-Cohorte{i}.pdf" for i in range(1,6)],
 *[f"DMD-2026A-Horaire_type-Cohorte{i}.pdf" for i in range(1,6)],
 "Échelle_conversion_2_evaluation__1er_2e_cycle_FMD_a_partir_automne_2011.pdf",
 "Liste_des_cours_1re_année_01.pdf","Liste_des_cours_2e_année_01.pdf","Liste_des_cours_3e_année_01.pdf",
 "Liste_des_cours_4e_année_01.pdf","Liste_des_cours_5e_année_01.pdf"]
nfc = lambda s: unicodedata.normalize("NFC", s)
CODE = re.compile(r"^([A-Z]{3}) (\d{4,5}[A-Z]?)\s*(.*)$")
NUM = re.compile(r"^\d+(?:,\d+)?$")
TYPES = {"Théorique", "Pratique", "Clinique", "Stage", "Laboratoire"}

def parse_courses(text, year):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    out, i = [], 0
    while i < len(lines):
        m = CODE.match(lines[i + 1]) if lines[i] in ("A", "H", "E") and i + 1 < len(lines) else None
        if not m: i += 1; continue
        term, (prefix, num, rest), j = lines[i], m.groups(), i + 2
        parts = [rest] if rest else []
        while j < len(lines) and not (NUM.match(lines[j]) and j + 1 < len(lines) and NUM.match(lines[j + 1])) \
                and not (lines[j] in ("A", "H", "E") and j + 1 < len(lines) and CODE.match(lines[j + 1])):
            parts.append(lines[j]); j += 1
        if j >= len(lines) or not NUM.match(lines[j]): i += 1; continue
        section = None
        if parts and parts[0].startswith("section "): section = parts.pop(0).split(" ", 1)[1]
        acad, prog = lines[j], lines[j + 1]; j += 2
        types = []
        while j < len(lines) and lines[j] in TYPES: types.append(lines[j]); j += 1
        out.append({"code": f"{prefix} {num}", "section": section, "title_fr": " ".join(parts), "term": term, "programYear": year,
                    "academicCredits": float(acad.replace(",", ".")), "progressiveCredits": float(prog.replace(",", ".")), "types": types})
        i = j
    return out

def main():
    src = Path(sys.argv[1]); out = Path(sys.argv[2] if len(sys.argv) > 2 else "data/staging/udem-2026-2027.staged.json")
    files = {nfc(p.name): p for p in src.glob("*.pdf")}
    inventory, candidates = [], []
    for name in EXPECTED:
        p = files.get(nfc(name))
        if not p: inventory.append({"filename": name, "state": "missing"}); continue
        try:
            data = p.read_bytes(); doc = pymupdf.open(p); text = "".join(pg.get_text() for pg in doc)
        except Exception as e:
            inventory.append({"filename": name, "state": "unreadable", "error": str(e)[:120]}); continue
        entry = {"filename": name, "sha256": hashlib.sha256(data).hexdigest(), "pages": len(doc), "textChars": len(text), "state": "parsed-needs-review"}
        m = re.match(r"Liste_des_cours_(\d)", name)
        if m:
            rows = parse_courses(text, int(m.group(1)))
            for r in rows: r["sourceFile"] = name
            candidates += rows; entry["candidateCourses"] = len(rows)
            entry["reportedTotals"] = re.findall(r"(\d+) cours? au trimestre d'(\w+)\s*\n?\s*([\d,]+)\s*\n?\s*([\d,]+)", text)
        else:
            entry["note"] = "Timetable/calendar/grading grid: not interpreted (weekday/time geometry needs visual review)."
        inventory.append(entry)
    existing = json.load(open("data/programs/udem-dmd.json"))["courses"]
    have = {c["code"] for c in existing}
    cand = {c["code"] for c in candidates}
    result = {
      "status": "PROVISIONAL - requires admin review and visual verification before any publication",
      "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
      "inventory": inventory, "candidates": candidates,
      "diff": {"inPdfsNotInSeed": sorted(cand - have), "inSeedNotInPdfs": sorted(have - cand),
               "candidateCount": len(candidates), "seedCount": len(existing)}}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print({k: len(v) if isinstance(v, list) else v for k, v in result["diff"].items()}, [ (i["filename"][:28], i["state"]) for i in inventory if i["state"] != "parsed-needs-review"])
main()
