import { useEffect } from "react";
import { formatSubtaskCompletionPrompt, type SubtaskCompletionAction } from "@synx/shared";
import type { SubtaskPromptState } from "../hooks/useSubtaskCompletionPrompt";

interface SubtaskCompletionModalProps {
  prompt: SubtaskPromptState | null;
  onConfirm: (action: SubtaskCompletionAction) => void;
  onCancel: () => void;
}

export function SubtaskCompletionModal({
  prompt,
  onConfirm,
  onCancel,
}: SubtaskCompletionModalProps) {
  useEffect(() => {
    if (!prompt || typeof document === "undefined") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [prompt, onCancel]);

  if (!prompt) return null;

  const copy = formatSubtaskCompletionPrompt(prompt.incompleteCount);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subtask-completion-prompt-title"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[60] flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <h3
          id="subtask-completion-prompt-title"
          className="text-base font-bold text-slate-100 font-display mb-2"
        >
          {copy.title}
        </h3>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">{copy.message}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] transition-colors cursor-pointer"
          >
            {copy.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm("promote")}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition-colors cursor-pointer"
          >
            {copy.promoteLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm("complete")}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo shadow-md transition-colors cursor-pointer"
          >
            {copy.completeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
