# UdeM D.M.D. research (official sources only)

Retrieved: 2026-11-01. Machine-readable data: `data/programs/udem-dmd.json`.
Every entry in the data comes from an official Université de Montréal page. Students must still confirm dates and courses with the Faculté de médecine dentaire (StudiUM, Centre étudiant). Pages and PDFs change during the year.

## What was found (VERIFIED)

**Program**
- Name: "Doctorat de 1er cycle en médecine dentaire" (D.M.D.). Program code **1-300-1-0**. Faculté de médecine dentaire.
- 5 years, full time only, 219 credits. Students advance as a cohort ("Programme à promotion par année"), and the faculty says "La réussite du programme est par année, et non par « cours »".
- Terms: years 1, 2, 3 and 5 have fall (A) and winter (H) terms. Year 4 also has a summer term (E).
- Program structure: blocs 70A to 70E (40 + 41.5 + 41 + 60.5 + 36 credits). These match years 1 to 5 in the faculty's per-year course lists.

**Courses**: 167 courses with official code, French title, academic credits, year and term.
- Titles and credits come from the program structure page. Year and term come from the faculty's per-year course lists.
- The credit totals for each year and each term match the totals printed on the lists, and the overall total is 219.
- Four title spellings differ slightly between the two sources (SAB 1051, SAB 3051, STO 4069/4070, STO 4001/4002). The JSON uses the structure-page spelling and notes the difference.
- Credits are *crédits académiques*. The lists also show *crédits progressifs* (used for billing and status), which are not recorded in the JSON.

**Calendar 2026-2027**
- **D.M.D. faculty calendar** (update 26.08.06, no longer marked provisional):
  - Fall: classes and integration week start the week of 2026-08-17. Clinics run 2026-08-24 to 2026-12-04. The term ends 2026-12-23.
  - Winter: classes resume 2027-01-07. Reading week is the week of 2027-03-01, and classes resume 2027-03-08. Clinics end 2027-04-14. The term ends 2027-04-30.
  - Summer (4th year only): intensive courses 2027-05-03 to 05-14, then a clinical and research internship 2027-05-17 to 08-13.
  - Holidays: 2026-10-05 is a special election day with no teaching activities at all. The other holidays are the usual statutory ones (in the JSON).
- **General UdeM calendar** (Registrar):
  - Fall: 2026-09-01 to 2026-12-23. "Activités libres dans certaines unités" 2026-10-19 to 10-25. Course-change deadline 09-16, withdrawal deadline 11-06.
  - Winter: 2027-01-07 to 04-30. Free-activity week 03-01 to 03-07. Course-change deadline 01-22, withdrawal deadline 03-12.
  - Summer: 2027-05-03 to 08-13, with its own deadlines.

**Student email**: the UdeM IT wiki says the institutional address `prenom.nom@umontreal.ca` is reserved for members of the university community, which includes students.

## What could not be found (UNVERIFIED or absent)

- **2027-2028 calendars**: not published yet. The Registrar lists 2026-2027 as current, and the faculty links only 2026-2027. These 3 term entries are left null.
- **D.M.D. exam periods**: not published. The faculty says exam schedules are announced at the start of each term by the Vice-décanat aux études et affaires étudiantes. Re-sit exam dates are marked "À confirmer".
- **English names**: there is no official English program name and no English course titles. The faculty's /en/ page shows only the French title.
- **Add/drop deadlines for D.M.D.**: only the general UdeM deadlines are published. Whether they apply to a cohort program with fixed course registration is not stated.

## Caveats

- **Dental students follow a faculty calendar, not the general one.** They start about 2 weeks earlier (week of Aug 17 vs Sep 1) and have no fall reading week (the general calendar's Oct 19-25 week is only "dans certaines unités"). Year 4 has a summer term. The Registrar's calendars page does not mention Médecine dentaire among faculties with their own calendar.
- Two weekday labels in the faculty PDF do not match the dates. "Mercredi 6" May 2027 is a Thursday, and "Jeudi 4" June 2027 is a Friday. Confirm these with the faculty.
- The winter reading-week end date (03-07) comes from the general calendar. The faculty only says "Semaine du 1er" and that classes resume 03-08.
- The per-year course list PDFs are undated. They were linked next to the 2026-2027 calendar on 2026-11-01.
- The JSON adds fields beyond the requested shape: `scope`, `keyDates`, `deadlines`, `bloc`, `placementSource`, `note`, `studentEmail`. `programYear` goes up to 5.

## Sources (all retrieved 2026-11-01)

- Program page: https://admission.umontreal.ca/programmes/doctorat-de-1er-cycle-en-medecine-dentaire/
- Program structure: https://admission.umontreal.ca/programmes/doctorat-de-1er-cycle-en-medecine-dentaire/structure-du-programme/
- Faculty program page: https://medecinedentaire.umontreal.ca/etudes/premier-cycle/ (EN: https://medecinedentaire.umontreal.ca/en/etudes/premier-cycle/)
- Faculty academic info (calendar and course list links): https://medecinedentaire.umontreal.ca/etudes/vie-fmd/infos-academiques/
- Faculty calendar 2026-2027 (current): https://medecinedentaire.umontreal.ca/fileadmin/medent/documents/Infos_academiques/Calendrier_facultaire/Calendrier-facultaire-2026-2027-MAJ-26.08.06.pdf
- Faculty calendar 2026-2027 (earlier provisional version, 2026-06-09; same dates): https://medecinedentaire.umontreal.ca/fileadmin/medent/documents/Infos_academiques/Calendrier_facultaire/Calendrier-facultaire-2026-2027_MAJ-26.06.09.pdf
- Course lists by year: https://medecinedentaire.umontreal.ca/fileadmin/medent/documents/Infos_academiques/Liste_cours_DMD/Liste_des_cours_1re_anne%CC%81e_01.pdf (and the same path with `2e`, `3e`, `4e`, `5e`)
- Registrar calendars page: https://registraire.umontreal.ca/dates-importantes/calendriers-universitaires/
- General calendar 2026-2027: https://registraire.umontreal.ca/fileadmin/registrariat/documents/calendriers/2026-2027_calendrier.pdf
- Email format: https://wiki.umontreal.ca/spaces/SIE/pages/208240871/Comment+acc%C3%A9der+au+courriel
