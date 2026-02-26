export function matchCustomId(
  pattern: string,
  customId: string
): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const idParts = customId.split("/");
  if (patternParts.length !== idParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;
    const ip = idParts[i]!;
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = ip;
    } else if (pp !== ip) {
      return null;
    }
  }
  return params;
}
