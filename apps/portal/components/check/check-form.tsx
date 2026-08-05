"use client";

import { useState, useRef, type FormEvent } from "react";

export interface CheckFormValues {
  national_id: string;
  amount?: number;
  phone?: string;
  account_name?: string;
  account_number?: string;
  reference_id?: string;
}

export function CheckForm({
  onSubmit,
  disabled,
  initialReferenceId,
}: {
  onSubmit: (values: CheckFormValues) => void;
  disabled: boolean;
  initialReferenceId: string | undefined;
}) {
  const [nationalId, setNationalId] = useState("");
  const [amount, setAmount] = useState("");
  const [showDetails, setShowDetails] = useState(Boolean(initialReferenceId));
  const [phone, setPhone] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [referenceId, setReferenceId] = useState(initialReferenceId ?? "");
  const [error, setError] = useState<string | null>(null);
  const idInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedId = nationalId.trim();
    if (trimmedId.length < 4) {
      setError("Enter a national ID (at least 4 digits) to run a check.");
      idInputRef.current?.focus();
      return;
    }
    setError(null);

    const values: CheckFormValues = { national_id: trimmedId };
    const parsedAmount = amount.trim() ? Number(amount) : undefined;
    if (parsedAmount !== undefined && !Number.isNaN(parsedAmount)) values.amount = parsedAmount;
    if (phone.trim()) values.phone = phone.trim();
    if (accountName.trim()) values.account_name = accountName.trim();
    if (accountNumber.trim()) values.account_number = accountNumber.trim();
    if (referenceId.trim()) values.reference_id = referenceId.trim();

    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="rounded-2xl border border-hairline bg-surface p-2 shadow-[0_1px_2px_rgba(26,24,21,0.04),0_8px_24px_-12px_rgba(26,24,21,0.08)]">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="national_id" className="sr-only">
              National ID
            </label>
            <input
              ref={idInputRef}
              id="national_id"
              type="text"
              inputMode="numeric"
              autoFocus
              autoComplete="off"
              placeholder="National ID"
              value={nationalId}
              onChange={(e) => {
                setNationalId(e.target.value);
                if (error) setError(null);
              }}
              disabled={disabled}
              className="w-full rounded-xl bg-transparent px-4 py-4 font-mono text-lg text-ink placeholder:font-sans placeholder:text-ink-soft/70 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div className="sm:w-40">
            <label htmlFor="amount" className="sr-only">
              Amount (KES)
            </label>
            <div className="flex h-full items-center rounded-xl bg-paper px-3 sm:bg-transparent">
              <span className="font-mono text-sm text-ink-soft">KES</span>
              <input
                id="amount"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={disabled}
                className="w-full rounded-xl bg-transparent px-2 py-4 text-right font-mono text-lg text-ink placeholder:text-ink-soft/50 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {showDetails && (
          <div className="grid grid-cols-1 gap-2 border-t border-hairline p-3 pt-3 sm:grid-cols-2">
            <LabeledInput label="Phone" value={phone} onChange={setPhone} disabled={disabled} placeholder="+254 7…" />
            <LabeledInput label="Reference label" value={referenceId} onChange={setReferenceId} disabled={disabled} placeholder="Loan ref / notes" />
            <LabeledInput label="Disbursement account name" value={accountName} onChange={setAccountName} disabled={disabled} placeholder="As given by applicant" />
            <LabeledInput label="Disbursement account number" value={accountNumber} onChange={setAccountNumber} disabled={disabled} placeholder="Account number" />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 p-2 pt-1">
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            className="rounded-md px-2 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            {showDetails ? "− Hide details" : "+ Add details"}
          </button>
          <button
            type="submit"
            disabled={disabled}
            className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run check
          </button>
        </div>
      </div>

      <div aria-live="polite" className="mt-3 min-h-[1.5rem] px-1 text-sm">
        {error ? <span className="text-block">{error}</span> : <span className="text-ink-soft">Enter an applicant to run a check. Press Enter to run.</span>}
      </div>
    </form>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}
