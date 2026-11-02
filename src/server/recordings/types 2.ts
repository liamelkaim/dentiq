// What a recording file may be: decided from the first bytes (never the extension or the browser's claim).
export type RecordingType = { mime: string; kind: "audio" | "video" };

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

export function detectRecordingType(name: string, bytes: Uint8Array): RecordingType | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (bytes.length < 12) return null;
  // MP4 family: "ftyp" at offset 4. m4a/aac audio uses brand M4A; everything else is treated as video.
  if (ascii(bytes, 4, 8) === "ftyp") {
    const audio = ascii(bytes, 8, 12).startsWith("M4A") || ext === "m4a";
    return audio ? { mime: "audio/mp4", kind: "audio" } : { mime: "video/mp4", kind: "video" };
  }
  // Matroska/WebM: EBML header.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return ext === "weba" || ext === "opus" ? { mime: "audio/webm", kind: "audio" } : { mime: "video/webm", kind: "video" };
  if (ascii(bytes, 0, 4) === "OggS") return { mime: "audio/ogg", kind: "audio" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return { mime: "audio/wav", kind: "audio" };
  // MP3: ID3 tag, or an MPEG frame sync (11 set bits).
  if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)) return { mime: "audio/mpeg", kind: "audio" };
  return null;
}
