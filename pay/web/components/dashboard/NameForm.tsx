"use client";

import { useActionState } from "react";
import { saveNameAction, type FormState } from "@/app/dashboard/actions";
import d from "./dashboard.module.css";

export default function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveNameAction, {});
  return (
    <form className={d.nameForm} action={action}>
      <label className={d.field}>
        <span className={d.label}>Name on your checkout</span>
        <span className={d.inline}>
          <input className={d.input} name="name" defaultValue={name} maxLength={60} placeholder="Your business or your name" required />
          <button className={d.secondary} type="submit" disabled={pending}>
            {pending ? "Saving" : "Save"}
          </button>
        </span>
      </label>
      <p className={state.error ? d.error : d.note} aria-live="polite">
        {state.error ?? (state.ok ? "Saved. New and existing links show this name." : name ? "" : "Until you set a name, payers see your address.")}
      </p>
    </form>
  );
}
