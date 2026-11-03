import type { ComponentType } from "react";
import type { Project } from "../lib/model";

/** Screens registered by feature area (filled in by each phase). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const screens: Record<string, ComponentType<any>> = {};
export type ScreenProps = { p: Project; params: string[] };
