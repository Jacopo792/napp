import { planeFit, type ImageView } from "@/features/editor/lib/mediaInk";

/** The style of a view's plane, in container units: the plane is the whole
 *  original laid out against the view box (`container-type: inline-size`, so
 *  `cqw` is the box's width) and moved, turned and scaled so that the crop is
 *  what the box shows. `spin` is the unwrapped turn count, so that turning
 *  again animates on through 360 instead of back round. */
export function planeCss(
  view: ImageView,
  natural: { w: number; h: number },
  spin: number,
): { aspect: number; style: React.CSSProperties } {
  const fit = planeFit(view, natural.w, natural.h);
  const c = (n: number) => `${(n * 100).toFixed(4)}cqw`;
  return {
    aspect: fit.aspect,
    style: {
      width: c(fit.width),
      aspectRatio: `${natural.w} / ${natural.h}`,
      transform: `translate(${c(fit.centre.x)}, ${c(fit.centre.y)}) rotate(${spin * 90}deg) translate(${c(-fit.offset.x)}, ${c(-fit.offset.y)})`,
    },
  };
}

export const MIN_CROP_SIZE = 0.06;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
