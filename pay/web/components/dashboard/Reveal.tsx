"use client";

import { useId, useState, type ReactNode } from "react";
import d from "./dashboard.module.css";

/**
 * A table that starts closed and reveals its rows `step` at a time.
 * Rows are rendered on the server and passed in, so this only holds the open/count state.
 */
export default function Reveal({
  noun,
  step,
  head,
  rows,
}: {
  noun: string;
  step: number;
  head: ReactNode;
  rows: ReactNode[];
}) {
  const tableId = useId();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(step);

  const visible = Math.min(shown, rows.length);
  const left = rows.length - visible;

  const toggle = () => {
    setOpen((was) => !was);
    setShown(step);
  };

  if (!open) {
    return (
      <button className={d.secondary} type="button" onClick={toggle} aria-expanded="false" aria-controls={tableId}>
        Show {noun} ({rows.length})
      </button>
    );
  }

  return (
    <>
      <table className={d.table} id={tableId}>
        <thead>{head}</thead>
        <tbody>{rows.slice(0, visible)}</tbody>
      </table>
      <div className={d.revealBar}>
        {left > 0 ? (
          <button className={d.secondary} type="button" onClick={() => setShown(visible + step)}>
            Show {Math.min(step, left)} more
          </button>
        ) : null}
        <span className={d.muted} aria-live="polite">
          {visible} of {rows.length}
        </span>
        <button className={d.textButton} type="button" onClick={toggle} aria-expanded="true" aria-controls={tableId}>
          Hide {noun}
        </button>
      </div>
    </>
  );
}
