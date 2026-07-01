import { z } from "zod";

export const SupportedLocaleSchema = z.enum(["en", "de"]);
export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>;

const messages = {
  en: {
    appName: "Slide Agent",
    navProjects: "Projects",
    navSettings: "Settings",
    navAdmin: "Admin",
    actionExport: "Export",
    actionGenerate: "Generate",
    editorProperties: "Properties",
    editorLayers: "Layers",
    editorDesign: "Design",
    editorAssets: "Assets"
  },
  de: {
    appName: "Slide Agent",
    navProjects: "Projekte",
    navSettings: "Einstellungen",
    navAdmin: "Administration",
    actionExport: "Exportieren",
    actionGenerate: "Generieren",
    editorProperties: "Eigenschaften",
    editorLayers: "Ebenen",
    editorDesign: "Design",
    editorAssets: "Assets"
  }
} as const;

export type MessageKey = keyof typeof messages.en;

export function t(locale: SupportedLocale, key: MessageKey): string {
  return messages[locale][key];
}

export function formatCurrency(value: number, currency: "EUR" | "USD", locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-US", {
    style: "currency",
    currency
  }).format(value);
}

export function getMessages(locale: SupportedLocale): Record<MessageKey, string> {
  return messages[locale];
}
