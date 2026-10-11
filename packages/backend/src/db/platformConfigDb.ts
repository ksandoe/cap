/**
 * platformConfigDb.ts — Platform-wide settings shared by every module.
 *
 * Stored as a reserved `_platform` item in the cap-module-config table
 * (both DynamoDB and the local JSON mirror), so no new table is needed.
 *
 * Holds:
 *   rubric  — master rubric override. When set, evaluations/conversation
 *             prompts use it instead of the MASTER_RUBRIC code constant.
 *             Editing changes what new evaluations measure against — the
 *             page warns that dimension-level comparability across modules
 *             is the whole point of a shared rubric.
 *   passkey — admin sign-in override (interim v3 auth). When set, it
 *             replaces ADMIN_PASSKEY from env. Superseded by the planned
 *             OTP + per-user role model.
 */
import { moduleConfigDb } from './moduleConfigDb';
import { MASTER_RUBRIC, MasterRubricDimension } from '@cap/shared';

const PLATFORM_KEY = '_platform';

export interface PlatformConfig {
  rubric?:    MasterRubricDimension[];
  passkey?:   string;
  updatedAt?: string;
  updatedBy?: string;
}

export const platformConfigDb = {
  async get(): Promise<PlatformConfig> {
    const item = await moduleConfigDb.getConfig(PLATFORM_KEY);
    return {
      rubric:    (item as any).rubric,
      passkey:   (item as any).passkey,
      updatedAt: (item as any).updatedAt,
      updatedBy: (item as any).updatedBy,
    };
  },

  async put(patch: Partial<PlatformConfig>, updatedBy?: string): Promise<PlatformConfig> {
    const cur  = await this.get();
    const next: PlatformConfig = { ...cur, ...patch, updatedAt: new Date().toISOString(), updatedBy };
    await moduleConfigDb.saveConfig({
      moduleId: PLATFORM_KEY,
      overallMin: 60, dimensionFloor: 40,   // required ModuleConfig fields; unused for _platform
      ...(next.rubric  !== undefined ? { rubric:  next.rubric }  : {}),
      ...(next.passkey !== undefined ? { passkey: next.passkey } : {}),
      updatedAt: next.updatedAt, updatedBy: next.updatedBy,
    } as any);
    return next;
  },

  /** The rubric evaluations use — stored override or the code constant. */
  async rubric(): Promise<MasterRubricDimension[]> {
    const cfg = await this.get().catch(() => null);
    return cfg?.rubric?.length ? cfg.rubric : MASTER_RUBRIC;
  },

  /** The effective admin passkey — stored override or env. An empty
   *  stored value (reset) falls back to the env var. */
  async passkey(): Promise<string> {
    const cfg = await this.get().catch(() => null);
    return cfg?.passkey || process.env.ADMIN_PASSKEY || 'cap-team-2026';
  },
};
