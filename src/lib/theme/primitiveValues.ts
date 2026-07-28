/**
 * Primitive color values for non-CSS contexts (email HTML).
 * Mirrors `src/styles/tokens.css` primitives — do not invent new hex here.
 * Email clients cannot consume CSS variables.
 */

export const primitiveColorValues = {
  slate950: "#0b1220",
  white: "#ffffff",
  navy900: "#041e42"
} as const;

export const emailColorValues = {
  textPrimary: primitiveColorValues.slate950,
  surface: primitiveColorValues.white,
  primary: primitiveColorValues.navy900
} as const;
