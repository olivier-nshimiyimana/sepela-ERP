import { useState } from "react";
import { eulaText, EULA_VERSION } from "../legal/license";

export default function LicenseAgreementModal({ onAccept }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-gray-700 bg-[#141414] shadow-2xl"
        role="dialog"
        aria-labelledby="eula-title"
        aria-modal="true"
      >
        <header className="border-b border-gray-800 px-6 py-4">
          <h1 id="eula-title" className="text-lg font-semibold text-white">
            License agreement
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Sepela ERP — version {EULA_VERSION}. You must accept before using the application.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-300">
            {eulaText.trim()}
          </pre>
        </div>

        <footer className="space-y-4 border-t border-gray-800 px-6 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-600 bg-[#0a0a0a] text-blue-600 focus:ring-blue-500"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              I have read and agree to the End User License Agreement and Terms of Use.
            </span>
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={!checked}
              onClick={onAccept}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              I Agree — Continue
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
