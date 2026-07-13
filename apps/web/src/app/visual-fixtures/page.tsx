import { VisualFixture } from "./visual-fixture";

type VisualMode = "editor" | "preview" | "exported";

export default async function VisualFixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const requestedMode = (await searchParams).mode;
  const mode: VisualMode =
    requestedMode === "preview" || requestedMode === "exported" ? requestedMode : "editor";

  return <VisualFixture mode={mode} />;
}
