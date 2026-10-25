import { useCallback, useState, type RefObject } from "react";

/* One line, not one per title: it glides from the title that was open to the
   one that is, both ends together over 260 ms on the phone's curve
   (`WhoseSwitch.tsx`) — no stretch, no spring. Its first place is taken
   without travel, so arriving is not a movement. The book's title strip draws
   whose manuscript with the same line, so this is a hook and not a part of
   the index. */
export type IndexLinePlace = { x: number; width: number; glide: boolean } | null;

export function useIndexLine(
  row: RefObject<HTMLElement | null>,
  activeSelector: string,
): [IndexLinePlace, () => void] {
  const [line, setLine] = useState<IndexLinePlace>(null);
  const place = useCallback(() => {
    const title = row.current?.querySelector<HTMLElement>(activeSelector);
    if (!title) return setLine(null);
    setLine((was) =>
      was && was.x === title.offsetLeft && was.width === title.offsetWidth
        ? was
        : { x: title.offsetLeft, width: title.offsetWidth, glide: was !== null },
    );
  }, [row, activeSelector]);
  return [line, place];
}
