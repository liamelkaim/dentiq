// University presets offered at onboarding. Only the name and key live here; verified data (email domains, calendar)
// comes from the admin settings and data/programs, never from this list.
export const UNIVERSITY_PRESETS = ["udem", "other"] as const;
export type UniversityPreset = (typeof UNIVERSITY_PRESETS)[number];

export const PROGRAM_YEAR_MAX = 6;
export const SEMESTER_MAX = 3;

export type OnboardingInput = { university: string; programYear: string; semester: string };
