import { ok } from "@/lib/api";

export function GET() {
  return ok({
    uiLocale: "en",
    presentationLocale: "en",
    preferredCurrency: "EUR",
    personalMaxSlideCount: 50,
    warningThresholdPercentage: 80,
    hardStopEnabled: true,
  });
}

export async function PATCH(request: Request) {
  return ok(await request.json());
}
