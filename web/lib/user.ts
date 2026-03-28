export function demoUserId(): string {
  return (
    process.env.NEXT_PUBLIC_DEMO_USER_ID ||
    "00000000-0000-0000-0000-000000000001"
  );
}

export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}
