#!/usr/bin/env python3
"""Stage PROVISIONAL UdeM D.M.D. 2026-2027 schedule facts (grading scale, faculty calendar, weekly timetables,
integration weeks) from the supplied PDFs, using text geometry (PyMuPDF only). Read-only on the PDFs.
Usage: python3 scripts/stage-udem-schedule.py <pdf-dir> [out.json]
Rules: only weekday/time/date/code facts printed in the PDFs are staged, each with a needsReview flag. Clinic
placements, groups and instructor assignments are NEVER staged (the PDFs say "Selon assignations" / "Voir Synchro" /
"À déterminer", or name people: names are dropped on purpose). 1er cycle and grades supérieurs scales stay separate.
Nothing here is published; publishing goes through the admin review flow."""
import json, re, sys, datetime, unicodedata
from pathlib import Path
import pymupdf

nfc = lambda s: unicodedata.normalize("NFC", s)
MONTHS = {"Janvier": 1, "Février": 2, "Mars": 3, "Avril": 4, "Mai": 5, "Juin": 6, "Juillet": 7, "Août": 8,
          "Septembre": 9, "Octobre": 10, "Novembre": 11, "Décembre": 12}
WEEKDAYS = {"Lundi": 0, "Mardi": 1, "Mercredi": 2, "Jeudi": 3, "Vendredi": 4, "Samedi": 5, "Dimanche": 6}
GRADE = re.compile(r"^(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D|E|F\*|F)$")
NUMF = re.compile(r"^\d+,\d$")
TIME = re.compile(r"^(\d{1,2})\s*h\s*(\d{2})?\s*(?:à|-)\s*(\d{1,2})\s*h\s*(\d{2})?$")
CODE = re.compile(r"\b([A-Z]{3}) (\d{4,5}[A-Z]?)\b")
ROOM = re.compile(r"^[A-Z]-?\d{1,4}[A-Z]?\s")
TYPE = {"TH": "theory", "TP": "practical", "CL": "clinic", "AT": "workshop"}
NAMES = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"]


def spans(page):
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = nfc(s["text"]).replace(" ", " ").strip()
                if t:
                    yield {"t": t, "x0": s["bbox"][0], "x1": s["bbox"][2], "y0": s["bbox"][1]}


def hm(h, m):
    return f"{int(h):02d}:{int(m or 0):02d}"


def parse_time(t):
    m = TIME.match(t)
    return (hm(m[1], m[2]), hm(m[3], m[4])) if m else None


def grading_scale(pdf):
    ss = list(spans(pymupdf.open(pdf)[0]))
    rows = []
    for g in [s for s in ss if GRADE.match(s["t"])]:
        line = sorted([s for s in ss if abs(s["y0"] - g["y0"]) < 3 and NUMF.match(s["t"])], key=lambda s: s["x0"])
        nums = [float(s["t"].replace(",", ".")) for s in line]
        if len(nums) == 6:
            rows.append((g["y0"], g["t"], nums))
    rows.sort()
    return {
        "source": "Échelle de conversion 2 (résolution CFMD-946-8.2, 6 sept. 2011, en vigueur automne 2011; document daté du 17 déc. 2011)",
        "scales": {
            "firstCycle": [{"grade": g, "lower": n[0], "upper": n[1], "step": n[2]} for _, g, n in rows],
            "higherDegrees": [{"grade": g, "step": n[3], "lower": n[4], "upper": n[5]} for _, g, n in rows],
        },
        "printedNotes": [
            "Les modifications au tableau de conversion ne touchent que les grades supérieurs. L'échelle du 1er cycle demeure la même.",
            "Grades supérieurs: B- = note minimale de passage dans les programmes de 2e cycle; C = note minimale de passage dans un cours des programmes de 2e cycle."],
        "notStated": "The PDF states no pass mark for the 1er cycle (D.M.D.); none is staged. Do not infer one.",
        "state": "provisional", "visuallyChecked": True,
    }


def faculty_calendar(pdf):
    events = []
    for pno, page in enumerate(pymupdf.open(pdf)):
        ss = list(spans(page))
        month = None
        for s in sorted(ss, key=lambda s: (s["y0"], s["x0"])):
            alone = not any(o is not s and abs(o["y0"] - s["y0"]) < 2 and o["x0"] > 60 for o in ss)
            if s["x0"] < 45 and s["t"] in MONTHS and alone and s["y0"] > 185:
                month = s["t"]
                continue
            is_label = s["x0"] < 45 and (s["t"] in WEEKDAYS or s["t"].startswith(("Semaine du", "Du ", "À ", "Entre")))
            if not is_label or month is None:
                continue
            same = sorted([o for o in ss if abs(o["y0"] - s["y0"]) < 3 and o is not s], key=lambda o: o["x0"])
            day = next((o["t"] for o in same if 90 < o["x0"] < 125), None)
            desc = re.sub(r"\s+", " ", " ".join(o["t"] for o in same if o["x0"] >= 125)).strip()
            mnum = MONTHS[month]
            year = (2026 if mnum >= 8 else 2027) if pno == 0 else 2027
            iso, consistent = None, None
            if day and re.fullmatch(r"\d{1,2}|1er", day):
                try:
                    d = datetime.date(year, mnum, 1 if day == "1er" else int(day))
                    iso = d.isoformat()
                    consistent = s["t"] not in WEEKDAYS or d.weekday() == WEEKDAYS[s["t"]]
                except ValueError:
                    pass
            ok = bool(iso) and consistent is True and pno == 0
            events.append({"month": month, "label": s["t"], "day": day, "date": iso, "description_fr": desc, "page": pno + 1,
                           "weekdayAgreesWithDate": consistent, "needsReview": not ok,
                           "reviewNote": None if ok else ("summer page not visually verified" if pno else "no single printed day (range, week or 'à confirmer')" if not iso else "printed weekday disagrees with date")})
    return {"source": "Calendrier facultaire 2026-2027 (MAJ 2026-08-06)", "state": "provisional",
            "note": "Page 1 (automne 2026, hiver 2027) was checked against the rendered page; page 2 (été 2027) was not.",
            "events": events}


def timetable(pdf, weekly):
    """A slot = a time span, the course-code span just below it in the same cell, the TH/TP/CL/AT token at the right end of
    the code row, and the room printed on the time row. Column = nearest weekday header centre."""
    ss = list(spans(pymupdf.open(pdf)[0]))
    heads = {s["t"]: s for s in ss if s["t"] in NAMES}
    centers = [(n, (heads[n]["x0"] + heads[n]["x1"]) / 2) for n in NAMES if n in heads]
    colw = centers[1][1] - centers[0][1]

    def col(x):
        n, c = min(centers, key=lambda nc: abs(nc[1] - x))
        return n if abs(c - x) < colw * 0.6 else None

    def cell(s):  # a cell spans from half a column left of its header centre to half a column right
        for n, c in centers:
            if c - colw * 0.52 <= s["x0"] < c + colw * 0.48:
                return n
        return None
    dates, ranges = {}, {}
    for s in ss:
        m = re.match(r"^(\d{1,2}) (\w+) 2026$", s["t"])
        if m and m[2].capitalize() in MONTHS and col(s["x0"] + 20):
            dates[col(s["x0"] + 20)] = datetime.date(2026, MONTHS[m[2].capitalize()], int(m[1])).isoformat()
        if weekly and re.match(r"^\d{1,2} \w+ au \d{1,2} \w+", s["t"]) and col(s["x0"] + 25):
            ranges[col(s["x0"] + 25)] = s["t"].rstrip(" *")
    slots = []
    for ts in [s for s in ss if parse_time(s["t"])]:
        c = cell(ts)
        if not c:
            continue
        cands = [s for s in ss if 3 < s["y0"] - ts["y0"] < 16 and cell(s) == c and CODE.search(s["t"]) and abs(s["x0"] - ts["x0"]) < colw * 0.6]
        code_s = min(cands, key=lambda s: s["y0"]) if cands else None
        room = next((s["t"] for s in ss if abs(s["y0"] - ts["y0"]) < 3 and s["x0"] > ts["x1"] and cell(s) == c and not parse_time(s["t"])), None)
        typ = None
        if code_s:
            tt = [s for s in ss if abs(s["y0"] - code_s["y0"]) < 3 and s["t"] in TYPE and code_s["x0"] < s["x0"] < code_s["x0"] + colw * 1.05]
            typ = TYPE[min(tt, key=lambda s: s["x0"])["t"]] if tt else None
        start, end = parse_time(ts["t"])
        cm = CODE.search(code_s["t"]) if code_s else None
        cr = re.search(r"\(([^)]*cr[^)]*)\)", code_s["t"]) if code_s else None
        unassigned = bool(room and re.search(r"assignation|\bSynchro|déterminer", room, re.I))
        mode_only = bool(room and re.search(r"Asynchrone|En-ligne", room, re.I))
        truncated = bool(room and not unassigned and not mode_only and not ROOM.match(room))
        if not cm:
            note = "no course code found under this time (activity or free text): not staged as a course"
        elif unassigned:
            note = "placement is per student assignment or not published; nothing staged for it"
        elif truncated:
            note = "room text is cut off in the PDF; verify visually"
        elif typ is None:
            note = "activity type (TH/TP/CL/AT) not found next to this slot; verify visually"
        else:
            note = "extracted by geometry; verify against the rendered page"
        slots.append({"weekday": c.capitalize(), "date": dates.get(c), "printedDateRange": ranges.get(c), "start": start, "end": end,
                      "code": f"{cm[1]} {cm[2]}" if cm else None, "creditsPrinted": cr[1] if cr else None, "type": typ,
                      "roomOrMode": None if unassigned or truncated else room, "needsReview": True, "reviewNote": note, "_y": ts["y0"]})
    slots.sort(key=lambda s: (NAMES.index(s["weekday"].upper()), s["_y"]))
    for s in slots:
        del s["_y"]
    return slots


def main():
    pdf_dir = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/staging/udem-2026-2027.schedule.staged.json")
    find = lambda pat: next(p for p in sorted(pdf_dir.iterdir()) if re.search(pat, nfc(p.name)) and " 2." not in p.name)
    res = {
        "status": "PROVISIONAL - stage only; requires admin review before any publication",
        "excluded": "Clinic placements, groups, instructor assignments and unprinted room details are never staged.",
        "gradingScale": grading_scale(find(r"chelle_conversion")),
        "facultyCalendar": faculty_calendar(find(r"Calendrier-facultaire")),
        "weeklyTimetables": {}, "integrationWeeks": {},
    }
    for i in range(1, 6):
        res["weeklyTimetables"][f"cohort{i}"] = {"source": f"Horaire type Cohorte {i}, automne 2026 (en date du 2026-07-09)",
                                                 "visuallyChecked": i == 1,  # rendered page 1 compared row by row with the extraction (22 slots); others not yet
                                                 "slots": timetable(find(rf"Horaire_type-Cohorte{i}\.pdf"), True)}
        res["integrationWeeks"][f"cohort{i}"] = {"source": f"Semaine d'intégration Cohorte {i}, rentrée 2026",
                                                 "visuallyChecked": i == 1,
                                                 "slots": timetable(find(rf"integration-Cohorte{i}\.pdf"), False)}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print("wrote", out)


if __name__ == "__main__":
    main()
