"use client";

import { useState } from "react";
import { deleteLinkAction } from "@/app/dashboard/actions";
import d from "./dashboard.module.css";

/** Two-step delete for a link that never took a payment: the first press asks, the second deletes. */
export default function DeleteLink({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button className={d.textButton} type="button" onClick={() => setAsking(true)}>
        Delete
      </button>
    );
  }
  return (
    <form action={deleteLinkAction} className={d.confirm}>
      <input type="hidden" name="id" value={id} />
      <button className={`${d.textButton} ${d.danger}`} type="submit" autoFocus>
        Delete for good
      </button>
      <button className={d.textButton} type="button" onClick={() => setAsking(false)}>
        Keep
      </button>
    </form>
  );
}
