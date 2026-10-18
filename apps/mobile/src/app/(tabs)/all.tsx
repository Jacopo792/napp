/* The Notes tab: every note of yours, under the page's own bar. */
import { ALL } from "@/lib/scopes";
import { useArchive } from "../../archive";
import { NoteList } from "../../NoteList";

export default function All() {
  const { session } = useArchive();
  return <NoteList owner={session.userId} scope={ALL} title="Notes" tab />;
}
