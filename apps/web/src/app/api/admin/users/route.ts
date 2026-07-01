import { ok } from "@/lib/api";

export function GET() {
  return ok([{ id: "demo-user", email: "user@example.com", role: "USER", verified: true }]);
}
