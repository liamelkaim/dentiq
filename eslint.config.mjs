import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", ".next.nosync/**", "node_modules/**", "node_modules.nosync/**", ".data/**", ".data.nosync/**", "drizzle/**", "next-env.d.ts"] },
];

export default config;
