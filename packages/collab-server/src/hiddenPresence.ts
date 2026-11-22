/* Presence crosses a block on no socket. Hocuspocus encodes one awareness
 * message per document and sends it to every connection, so the cut is made
 * where each connection sends: entries whose identity is on the other side of
 * a block from the recipient are taken out. The identity is the one this
 * server stamped in `beforeHandleAwareness`, never what a browser said.
 *
 * Until the recipient's list has been read (`null`), only their own clients
 * pass: unverified presence stays hidden, as it does in the client. */
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

const AWARENESS = 1;

export function withoutHiddenPresence(
  message: Uint8Array,
  hidden: ReadonlySet<string> | null,
  self: string,
): Uint8Array | null {
  const decoder = decoding.createDecoder(message);
  const address = decoding.readVarString(decoder);
  if (decoding.readVarUint(decoder) !== AWARENESS) return message;
  const update = decoding.createDecoder(decoding.readVarUint8Array(decoder));

  const kept: [number, number, string][] = [];
  let dropped = false;
  for (let count = decoding.readVarUint(update); count > 0; count--) {
    const entry: [number, number, string] = [
      decoding.readVarUint(update),
      decoding.readVarUint(update),
      decoding.readVarString(update),
    ];
    const userId = (JSON.parse(entry[2]) as { user?: { userId?: unknown } } | null)?.user?.userId;
    if (typeof userId === "string" && userId !== self && (hidden === null || hidden.has(userId)))
      dropped = true;
    else kept.push(entry);
  }
  if (!dropped) return message;
  if (!kept.length) return null;

  const states = encoding.createEncoder();
  encoding.writeVarUint(states, kept.length);
  for (const [client, clock, state] of kept) {
    encoding.writeVarUint(states, client);
    encoding.writeVarUint(states, clock);
    encoding.writeVarString(states, state);
  }
  const out = encoding.createEncoder();
  encoding.writeVarString(out, address);
  encoding.writeVarUint(out, AWARENESS);
  encoding.writeVarUint8Array(out, encoding.toUint8Array(states));
  return encoding.toUint8Array(out);
}
