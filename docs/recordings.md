# Recordings

Lecture recordings (audio or video), private to the student who adds them.

## Rules built in

- Admin switch **OFF by default** (Admin > Recordings). While off, nobody can add a recording; people who already have some can still play and delete them. The menu item shows only while the switch is on.
- Upload needs a three-box consent checklist (allowed to record, lecturer agreed for personal study, will keep it private). The time of confirmation is stored on the recording.
- File type is decided from the first bytes (mp3, m4a/mp4, wav, ogg, webm); a renamed file is refused. Size limit and per-student space quota are admin settings (defaults 200 MB per file, 1 GB per student).
- Private: every query filters on the owner. Other students and the administrator cannot list, open, stream, annotate or delete someone else's recording. Files are served only through `/api/recordings/<id>` (signed-in owner, HTTP Range for seeking, never cached or public).
- Player with speed control (0.75x to 2x) and per-recording notes at a chosen second.
- Included in the account data export (details and notes, not the file) and removed, file included, when the account is deleted. The audit trail records sizes and ids, never titles or text.
- **Transcription is not built.** `src/server/recordings/transcription.ts` is an interface only; no provider exists or is configured, and nothing is sent anywhere. A provider would need the admin to choose it and an explicit consent text first.

## Cost and hosting limits (free tier)

- Storage uses the existing adapter: local files on a computer, Vercel Blob when deployed. Blob's free allowance is about 1 GB in total for everyone, so a few lectures can fill it. A 1-hour lecture is roughly 30 to 60 MB as audio, 300 MB or more as video.
- On Vercel, a request body is limited to 4.5 MB, so the current upload route cannot receive a real lecture there. Recordings are therefore a local feature until direct-to-Blob client uploads are built. Keep the switch OFF in production.
- Playback reads the whole file into memory to honour Range requests: fine locally, not for large files on a small server.

## Owner decisions

Whether to offer this at all (consent and lecturer policy under Law 25), the storage budget, and whether a transcription provider is ever acceptable.
