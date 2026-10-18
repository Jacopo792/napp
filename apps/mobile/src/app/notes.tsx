/* A folder, or the shelf, or the bin, pushed from Home. */
import { useLocalSearchParams } from "expo-router";
import { NoteList } from "../NoteList";

export default function Notes() {
  const { owner, scope, title } = useLocalSearchParams<{
    owner: string;
    scope: string;
    title: string;
  }>();
  return <NoteList owner={owner} scope={scope} title={title} />;
}
