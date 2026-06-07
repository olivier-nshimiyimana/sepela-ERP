import { z } from "zod";

export const INDUSTRY_PROFILE_VALUES = [
  "pharmacy",
  "restaurant_bar",
  "hotel",
  "general_retail",
] as const;

export type IndustryProfile = (typeof INDUSTRY_PROFILE_VALUES)[number];

export const industryProfileSchema = z.enum(INDUSTRY_PROFILE_VALUES);

export const DEFAULT_INDUSTRY_PROFILE: IndustryProfile = "general_retail";
