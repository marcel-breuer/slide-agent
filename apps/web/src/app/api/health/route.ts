export function GET() {
  return Response.json({
    status: "ok",
    service: "slide-agent-web",
    timestamp: new Date().toISOString(),
  });
}
