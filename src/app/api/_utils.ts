export function apiError(error: unknown) {
  console.error("Workspace API request failed:", error);
  return Response.json(
    { error: error instanceof Error ? error.message : "An unexpected error occurred." },
    { status: 500 },
  );
}

export function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isPriority(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}
