"use client";
import { useState } from "react";

/** A button that asks "are you sure?" inline (no browser pop-up) before running a server action. */
export function ConfirmButton({ action, label, confirm, primary, danger }: {
  action: () => Promise<void>; label: string; confirm: string; primary?: boolean; danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const cls = `btn${primary ? " primary" : ""}${danger ? " danger" : ""}`;
  if (!asking) return <button type="button" className={cls} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <form action={action} className="card" style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", maxWidth: 420 }}>
      <span className="small" style={{ flex: "1 1 200px" }}>{confirm}</span>
      <button type="submit" className={`btn sm${primary ? " primary" : ""}${danger ? " danger" : ""}`}>Yes, {label.toLowerCase()}</button>
      <button type="button" className="btn sm" onClick={() => setAsking(false)}>Never mind</button>
    </form>
  );
}
