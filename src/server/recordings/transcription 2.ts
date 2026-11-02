// Transcription hook. DESIGN ONLY: no provider is implemented, none is configured, and nothing is ever sent anywhere.
// A future provider must implement this interface, be chosen by the administrator, and show an explicit consent text
// (recordings are private data under Quebec Law 25) before any audio leaves the app.
export interface TranscriptionProvider {
  id: string;
  isConfigured(): boolean;
  transcribe(audio: Uint8Array, mime: string, language: "fr" | "en"): Promise<{ text: string }>;
}

/** The only provider that exists: none. */
export function getTranscriptionProvider(): TranscriptionProvider | null {
  return null;
}
