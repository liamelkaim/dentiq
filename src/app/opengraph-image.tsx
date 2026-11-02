// Share image (Open Graph and Twitter) built from the original logo and the same vector mountain ridges as the app header.
// Static: generated once at build time. No photo, no stock art.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Dentiq, a study space for dental students";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FAR: [number, number][] = [[0, 520], [120, 470], [240, 500], [380, 400], [480, 450], [600, 360], [700, 420], [820, 330], [920, 400], [1040, 300], [1120, 380], [1200, 340]];
const NEAR: [number, number][] = [[0, 580], [160, 540], [320, 570], [480, 500], [640, 555], [800, 490], [960, 550], [1100, 510], [1200, 545]];
const poly = (pts: [number, number][]) => `0,630 ${pts.map(([x, y]) => `${x},${y}`).join(" ")} 1200,630`;

export default async function Image() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/brand/dentiq-icon.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-start", padding: 72, background: "linear-gradient(160deg, #0b1d36 0%, #07111f 100%)", color: "#ffffff", position: "relative" }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          <polygon points={poly(FAR)} fill="#2a4a78" />
          <polygon points={poly(NEAR)} fill="#16304f" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={logo} width={96} height={96} alt="" style={{ borderRadius: 22 }} />
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>Dentiq</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 52, fontWeight: 600, maxWidth: 900, lineHeight: 1.15 }}>Study space for dental students</div>
        <div style={{ marginTop: 20, fontSize: 30, color: "#9db6d8" }}>Notes · Past exams · Calendar · Flashcards</div>
      </div>
    ),
    size,
  );
}
