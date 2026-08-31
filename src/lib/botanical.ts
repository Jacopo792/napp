/* Which plate a thing gets. Kept out of the component file so that file exports
   components and nothing else — React Fast Refresh gives up on a module that
   mixes the two. */

export type PlateFlower = "narcissus" | "lycoris" | "lotus";

const PLATE_FLOWERS: PlateFlower[] = ["narcissus", "lycoris", "lotus"];

/** Stable, and stored nowhere: a note keeps its flower because the seed is its
 *  id, and the login screen changes because the seed is the day. */
export function flowerFor(seed: string): PlateFlower {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return PLATE_FLOWERS[Math.abs(hash) % PLATE_FLOWERS.length];
}
