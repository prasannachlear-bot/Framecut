import React from "react";

export function Row({
  label,
  children,
  tip,
}: {
  label: string;
  children: React.ReactNode;
  tip?: string;
}) {
  return (
    <div className="row" data-tip={tip}>
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

export function NumRow({
  label, value, onChange, min = -10, max = 10, step = 0.01, fmt, tip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  fmt?: (v: number) => string;
  tip?: string;
}) {
  return (
    <div className="row" data-tip={tip}>
      <span className="lbl">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="val">{fmt ? fmt(value) : value.toFixed(2)}</span>
    </div>
  );
}

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="insp-section">
      <div className="sec-head">
        <span>{title}</span>
        {right}
      </div>
      <div className="sec-body">{children}</div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = 520,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function ToggleBtn({
  on, onClick, children, tip = "",
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tip?: string;
}) {
  return (
    <button className={on ? "active" : ""} onClick={onClick} data-tip={tip}>
      {children}
    </button>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
