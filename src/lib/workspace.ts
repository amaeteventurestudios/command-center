import { CONFIG, SPACE_IDS, type SpaceId } from "./config";

export type { SpaceId } from "./config";

/**
 * Which spaces a host may show. A space with "hosts" in command.config.json is shown
 * alone on those hosts; every other host shows all spaces with a switch.
 * COMMAND_SPACES=work or work,side overrides.
 */
export function spacesForHost(host: string | null): SpaceId[] {
  const override = process.env.COMMAND_SPACES;
  if (override) {
    const list = override.split(",").map((s) => s.trim()).filter((s) => SPACE_IDS.includes(s));
    if (list.length) return list;
  }
  const h = (host ?? "").toLowerCase().split(":")[0];
  const only = CONFIG.spaces.filter((s) => s.hosts.some((x) => h === x || h.endsWith(`.${x}`)));
  return only.length ? only.map((s) => s.id) : SPACE_IDS;
}
