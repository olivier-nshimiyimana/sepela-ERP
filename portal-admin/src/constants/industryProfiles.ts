export const INDUSTRY_PROFILES = [
  { value: "pharmacy", label: "Pharmacy" },
  { value: "restaurant_bar", label: "Restaurant / Bar" },
  { value: "hotel", label: "Hotel" },
  { value: "general_retail", label: "General retail" },
] as const;

export type IndustryProfile = (typeof INDUSTRY_PROFILES)[number]["value"];

export const DEFAULT_INDUSTRY_PROFILE: IndustryProfile = "general_retail";

export function industryProfileLabel(value: string | null | undefined) {
  return INDUSTRY_PROFILES.find((entry) => entry.value === value)?.label ?? value ?? "—";
}
