const CONVERT_ERROR_CODES = new Set([
  "unsupported",
  "malformed",
  "encrypted",
  "resourceLimit",
  "missingPart",
  "io",
]);

export function isConvertError(error: unknown): error is Error & { code: string } {
  const code = (error as { code?: unknown } | undefined)?.code;
  return error instanceof Error && typeof code === "string" && CONVERT_ERROR_CODES.has(code);
}
