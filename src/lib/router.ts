export function matchCustomId(
  pattern: string,
  customId: string
): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const idParts = customId.split("/");

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;

    if (pp.startsWith("...")) {
      // catch-all: consumes all remaining id segments (must have at least one)
      if (i >= idParts.length) return null;
      params[pp.slice(3)] = idParts.slice(i).join("/");
      return params;
    }

    if (i >= idParts.length) return null;
    const ip = idParts[i]!;

    if (pp.startsWith(":")) {
      params[pp.slice(1)] = ip;
    } else if (pp !== ip) {
      return null;
    }
  }

  // non-catch-all: pattern must fully consume all id parts
  if (patternParts.length !== idParts.length) return null;
  return params;
}
