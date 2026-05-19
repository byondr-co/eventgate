import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import prettierConfig from "eslint-config-prettier";

const config = [
  ...nextCoreWebVitals,
  prettierConfig,
  {
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts"],
  },
];

export default config;
