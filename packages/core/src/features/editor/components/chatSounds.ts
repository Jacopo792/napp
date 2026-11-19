/* The chat's two sounds on the web and desktop: a rising pop when your
 * message leaves, a soft two-note chime when someone else's arrives. The
 * phone plays the same files through its own player. */
import received from "@/assets/sounds/chat-received.wav";
import sent from "@/assets/sounds/chat-sent.wav";

const players = new Map<string, HTMLAudioElement>();

export function playChatSound(which: "sent" | "received"): void {
  const url = which === "sent" ? sent : received;
  let player = players.get(url);
  if (!player) {
    player = new Audio(url);
    player.volume = 0.5;
    players.set(url, player);
  }
  player.currentTime = 0;
  /* A window that has never been clicked may refuse; silence is fine. */
  void player.play().catch(() => {});
}
