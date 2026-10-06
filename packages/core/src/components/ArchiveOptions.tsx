/* What an archive is for, and which tools it carries. One list of rows, shown
 * twice: while the archive is being made, and in its own sheet afterwards —
 * two forms would be two lists of options to keep agreeing.
 *
 * "Chapters" is the kind, which is a column; everything under it is a key in
 * `settings.features`, and only exists while the kind is a document. */
import { useState, type ReactNode } from "react";
import { Chapters, Footnote, ListOrdered, Quote, Review, Target, Users } from "@/components/icons";
import {
  ARCHIVE_PRESETS,
  type ArchiveKind,
  type ArchivePreset,
  type DocumentFeatures,
} from "@/lib/spaceShape";

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

function presetOf(kind: ArchiveKind, features: DocumentFeatures): ArchivePreset | null {
  const match = ARCHIVE_PRESETS.find(
    (preset) =>
      preset.kind === kind &&
      (kind === "notes" || JSON.stringify(preset.features) === JSON.stringify(features)),
  );
  return match?.id ?? null;
}

export function ArchiveOptions({
  kind,
  features,
  disabled,
  withPresets,
  onChange,
}: {
  kind: ArchiveKind;
  features: DocumentFeatures;
  disabled?: boolean;
  /** Only while making one: afterwards a preset would overwrite choices made
   *  since, which is the opposite of what pressing a name should do. */
  withPresets?: boolean;
  onChange: (kind: ArchiveKind, features: DocumentFeatures) => void;
}) {
  const preset = presetOf(kind, features);
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
      onChange(kind, next);
    }
  }

  return (
    <div className="archive-options">
      {withPresets && (
        <div className="settings-segment archive-presets" role="group" aria-label="Start from">
          {ARCHIVE_PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={preset === option.id}
              className={`press ${preset === option.id ? "is-active" : ""}`}
              onClick={() => {
                setGoal("wordGoal" in option.features ? String(option.features.wordGoal) : "");
                onChange(option.kind, { ...option.features });
              }}
            >
              <span>{option.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="appearance-controls">
        <Row icon={<Chapters size={16} />} name="One document in chapters">
          <input
            type="checkbox"
            role="switch"
            disabled={disabled}
            checked={kind === "document"}
            onChange={(event) => onChange(event.target.checked ? "document" : "notes", features)}
          />
        </Row>
      </div>

      {kind === "document" && (
        <>
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
                    onClick={() => onChange(kind, { ...features, manuscript: id })}
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
                  onChange={(event) =>
                    onChange(kind, { ...features, [option.key]: event.target.checked })
                  }
                />
              </Row>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
