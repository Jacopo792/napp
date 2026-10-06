/* Which tools a book carries. One list of rows, shown in the archive's sheet
 * and in Settings → Document — two forms would be two lists to keep agreeing.
 *
 * The kind is not here. It is chosen when the archive is made and changed only
 * from the archive's sheet, under its own name: a switch among these rows
 * turned a book into notes, and the Settings section that could have turned
 * it back belonged to the book and went with it. */
import { useState, type ReactNode } from "react";
import { Footnote, ListOrdered, Quote, Review, Target, Users } from "@/components/icons";
import type { DocumentFeatures } from "@/lib/spaceShape";

const SWITCHES: {
  key: "numbering" | "footnotes" | "citations" | "review";
  name: string;
  icon: ReactNode;
}[] = [
  { key: "numbering", name: "Numbered headings and contents", icon: <ListOrdered size={16} /> },
  { key: "footnotes", name: "Footnotes", icon: <Footnote size={16} /> },
  { key: "citations", name: "Citations", icon: <Quote size={16} /> },
  { key: "review", name: "Suggested changes", icon: <Review size={16} /> },
];

function Row({ icon, name, children }: { icon: ReactNode; name: string; children: ReactNode }) {
  return (
    <label className="appearance-row">
      <span className="settings-lead" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-label">
        <b>{name}</b>
      </span>
      {children}
    </label>
  );
}

export function ArchiveOptions({
  features,
  disabled,
  onChange,
}: {
  features: DocumentFeatures;
  disabled?: boolean;
  onChange: (features: DocumentFeatures) => void;
}) {
  /* The goal is typed, so it is held as text until it is a number: a field
     that rewrote "4" into "4" while "40000" was on its way is a fight. */
  const [goal, setGoal] = useState(features.wordGoal ? String(features.wordGoal) : "");

  function commitGoal() {
    const value = Number(goal.replace(/[^\d]/g, ""));
    const wordGoal = Number.isInteger(value) && value > 0 ? Math.min(value, 10_000_000) : undefined;
    setGoal(wordGoal ? String(wordGoal) : "");
    if (wordGoal !== features.wordGoal) {
      const next = { ...features };
      if (wordGoal) next.wordGoal = wordGoal;
      else delete next.wordGoal;
      onChange(next);
    }
  }

  return (
    <div className="archive-options">
      <div className="appearance-controls">
        <div className="appearance-row">
          <span className="settings-lead" aria-hidden="true">
            <Users size={16} />
          </span>
          <span className="settings-label">
            <b>Manuscript</b>
          </span>
          <div className="settings-segment is-inline" role="group" aria-label="Manuscript">
            {(
              [
                ["own", "One each"],
                ["shared", "Shared"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                disabled={disabled}
                aria-pressed={features.manuscript === id}
                className={`press ${features.manuscript === id ? "is-active" : ""}`}
                onClick={() => onChange({ ...features, manuscript: id })}
              >
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>
        <Row icon={<Target size={16} />} name="Word goal">
          <input
            className="archive-goal"
            inputMode="numeric"
            placeholder="None"
            disabled={disabled}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            onBlur={commitGoal}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          />
        </Row>
      </div>

      <div className="appearance-controls">
        {SWITCHES.map((option) => (
          <Row key={option.key} icon={option.icon} name={option.name}>
            <input
              type="checkbox"
              role="switch"
              disabled={disabled}
              checked={features[option.key]}
              onChange={(event) => onChange({ ...features, [option.key]: event.target.checked })}
            />
          </Row>
        ))}
      </div>
    </div>
  );
}
