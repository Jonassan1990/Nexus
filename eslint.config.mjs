import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const nextCoreWebVitalsConfig = nextCoreWebVitals.map((config) =>
  config.plugins?.["react-hooks"]
    ? {
        ...config,
        rules: {
          ...config.rules,
          "react-hooks/set-state-in-effect": "off"
        }
      }
    : config
);

const eslintConfig = [
  ...nextCoreWebVitalsConfig,
  ...nextTypescript,
  {
    ignores: [".next/**", ".cursor/**", "node_modules/**", "output/**", "tmp/**", "next-env.d.ts"]
  }
];

export default eslintConfig;
