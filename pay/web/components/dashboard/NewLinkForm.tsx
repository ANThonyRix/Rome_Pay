"use client";

import { useActionState, useState } from "react";
import { createLinkAction, type FormState } from "@/app/dashboard/actions";
import CopyLink from "./CopyLink";
import d from "./dashboard.module.css";

export default function NewLinkForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createLinkAction, {});
  const [mode, setMode] = useState<"fixed" | "open">("fixed");
  const [uses, setUses] = useState<"one" | "many">("one");

  return (
    <form className={d.form} action={action} aria-labelledby="new-link-title">
      <h2 id="new-link-title" className={d.sectionTitle}>
        New payment link
      </h2>

      <fieldset className={d.modes}>
        <legend className={d.label}>Amount</legend>
        <label className={d.mode}>
          <input type="radio" name="mode" value="fixed" checked={mode === "fixed"} onChange={() => setMode("fixed")} />
          <span>Fixed amount</span>
        </label>
        <label className={d.mode}>
          <input type="radio" name="mode" value="open" checked={mode === "open"} onChange={() => setMode("open")} />
          <span>Payer enters it</span>
        </label>
      </fieldset>

      {mode === "fixed" ? (
        <label className={d.field}>
          <span className={d.label}>Amount, USDC</span>
          <input className={d.input} name="amount" inputMode="decimal" autoComplete="off" placeholder="25.00" required />
        </label>
      ) : (
        <p className={d.note}>For tips and donations. The payer types any amount; the link takes any number of payments.</p>
      )}

      <label className={d.field}>
        <span className={d.label}>What it is for</span>
        <input className={d.input} name="memo" maxLength={140} placeholder={mode === "open" ? "Tip jar" : "Logo design, first draft"} required />
      </label>

      {mode === "fixed" ? (
        <>
          <fieldset className={d.modes}>
            <legend className={d.label}>Payments</legend>
            <label className={d.mode}>
              <input type="radio" name="uses" value="one" checked={uses === "one"} onChange={() => setUses("one")} />
              <span>One payment</span>
            </label>
            <label className={d.mode}>
              <input type="radio" name="uses" value="many" checked={uses === "many"} onChange={() => setUses("many")} />
              <span>Many payments</span>
            </label>
          </fieldset>
          <p className={d.note}>
            {uses === "one"
              ? "An invoice: the link closes once it is paid."
              : "A price tag: anyone can pay this amount, as many times as they like, until you close the link."}
          </p>
        </>
      ) : null}

      <button className={d.primary} type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "Creating link" : "Create link"}
      </button>

      <div className={d.formStatus} aria-live="polite">
        {state.error ? <p className={d.error}>{state.error}</p> : null}
        {state.linkId && !pending ? (
          <p className={d.created}>
            <span>Link ready:</span> <code>/pay/{state.linkId}</code> <CopyLink id={state.linkId} />
          </p>
        ) : null}
      </div>
    </form>
  );
}
