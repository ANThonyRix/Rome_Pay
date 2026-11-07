"use client";

import { useState } from "react";
import d from "./dashboard.module.css";

/** Copies the absolute checkout URL for a link id. */
export default function CopyLink({ id, label = "Copy link" }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", `${window.location.origin}/pay/${id}`);
    }
  };
  return (
    <button className={d.textButton} type="button" onClick={copy} aria-live="polite">
      {copied ? "Copied" : label}
    </button>
  );
}
