import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

/* Draw on iPhone: a picture or a board on the desk is handed to the phone
 * signed into the same account, drawn on there full screen, and handed back.
 *
 * Only the asking crosses this channel. The strokes themselves are written by
 * the phone into the note's own Y.Doc, as any stroke is, so the desk watches
 * them arrive through collaboration and the server judges them as it judges
 * every edit. The channel is private and its topic is the account's own
 * (`draw:<userId>`); RLS on `realtime.messages` admits nobody else to it.
 *
 * Presence says whether a phone is listening, so the desk offers the action
 * only when somebody can answer it. */

/** One block of one note: a picture by its stored object, a board by its
 *  place among the note's boards. */
export type DrawTarget = { noteId: string } & ({ objectId: string } | { board: number });

export const drawKey = (target: DrawTarget) =>
  `${target.noteId}:${"objectId" in target ? target.objectId : `board${target.board}`}`;

type Session = { userId: string };
type Message = { key: string; target?: DrawTarget };

let channel: RealtimeChannel | null = null;
let present = false;
const presenceHeard = new Set<(present: boolean) => void>();
const asks = new Set<(target: DrawTarget) => void>();
const settles = new Map<string, Set<(event: "done" | "cancel") => void>>();

const settle = (event: "done" | "cancel") => (message: { payload?: unknown }) => {
  const key = (message.payload as Message | undefined)?.key;
  if (!key) return;
  for (const heard of settles.get(key) ?? []) heard(event);
};

/** Join the account's drawing channel: as the desk, as the phone app that
 *  answers, or as the phone's editor page that draws. One per window; the
 *  returned function leaves it. */
export function attachDrawing(session: Session, device: "desk" | "phone" | "page"): () => void {
  /* Two editors open in one window share the one channel. */
  const key = `${session.userId}:${device}`;
  if (attached?.key === key) {
    attached.count++;
    return release;
  }
  attached?.leave();
  const leave = join(session, device);
  attached = { key, count: 1, leave };
  return release;
}

let attached: { key: string; count: number; leave: () => void } | null = null;
function release() {
  if (!attached || --attached.count > 0) return;
  attached.leave();
  attached = null;
}

function join(session: Session, device: "desk" | "phone" | "page"): () => void {
  const joined = supabase.channel(`draw:${session.userId}`, {
    config: {
      private: true,
      presence: { key: `${device}:${Math.random().toString(36).slice(2)}` },
    },
  });
  channel = joined;
  joined
    .on("presence", { event: "sync" }, () => {
      const phones = Object.keys(joined.presenceState()).some((key) => key.startsWith("phone:"));
      present = device === "desk" && phones;
      for (const heard of presenceHeard) heard(present);
    })
    .on("broadcast", { event: "ask" }, (message) => {
      const target = (message.payload as Message | undefined)?.target;
      if (device === "phone" && target) for (const heard of asks) heard(target);
    })
    .on("broadcast", { event: "done" }, settle("done"))
    .on("broadcast", { event: "cancel" }, settle("cancel"))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void joined.track({ device });
    });
  return () => {
    if (channel === joined) channel = null;
    present = false;
    for (const heard of presenceHeard) heard(false);
    void supabase.removeChannel(joined);
  };
}

/** Whether a phone is listening now, and every change of it. */
export function phonePresent(): boolean {
  return present;
}
export function onPhonePresence(heard: (present: boolean) => void): () => void {
  presenceHeard.add(heard);
  return () => presenceHeard.delete(heard);
}

/** The phone's half: what the desk asks for. */
export function onDrawAsk(heard: (target: DrawTarget) => void): () => void {
  asks.add(heard);
  return () => asks.delete(heard);
}

function hear(key: string, heard: (event: "done" | "cancel") => void) {
  const set = settles.get(key) ?? new Set();
  set.add(heard);
  settles.set(key, set);
  return () => {
    set.delete(heard);
    if (!set.size) settles.delete(key);
  };
}

function send(on: RealtimeChannel, event: "ask" | "done" | "cancel", message: Message) {
  void on.send({ type: "broadcast", event, payload: message });
}

/** The desk asks. `done` settles when the phone puts the pen down — Done or
 *  Cancel there — and `cancel` takes the pen back. */
export function lendToPhone(target: DrawTarget): { done: Promise<void>; cancel: () => void } {
  const key = drawKey(target);
  let stop = () => {};
  let over = false;
  const done = new Promise<void>((resolve, reject) => {
    if (!channel) return reject(new Error("No phone is listening"));
    stop = hear(key, () => {
      over = true;
      stop();
      resolve();
    });
    send(channel, "ask", { key, target });
  });
  return {
    done,
    cancel: () => {
      if (over) return;
      over = true;
      stop();
      if (channel) send(channel, "cancel", { key });
    },
  };
}

/** The phone's page, drawing what was asked for: `cancelled` settles if the
 *  desk takes the pen back, and `finish` tells the desk it is done. */
export function holdForDesk(target: DrawTarget): { cancelled: Promise<void>; finish: () => void } {
  const key = drawKey(target);
  let stop = () => {};
  const cancelled = new Promise<void>((resolve) => {
    stop = hear(key, (event) => {
      if (event === "cancel") resolve();
    });
  });
  return {
    cancelled,
    finish: () => {
      stop();
      if (channel) send(channel, "done", { key });
    },
  };
}
