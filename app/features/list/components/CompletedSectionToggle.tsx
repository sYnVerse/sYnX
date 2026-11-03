interface CompletedSectionToggleProps {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  itemLabel: "tasks" | "subtasks";
  isSubtask?: boolean;
}

/**
 * Header of the collapsible "Completed" section at the bottom of a list or a
 * task's subtasks. Same behavior as mobile: collapsed by default, not remembered.
 */
export function CompletedSectionToggle({
  count,
  expanded,
  onToggle,
  itemLabel,
  isSubtask = false,
}: CompletedSectionToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`Completed ${itemLabel}, ${count}. ${expanded ? "Hide" : "Show"} them`}
      className={`flex items-center gap-1.5 font-bold text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-colors duration-200 cursor-pointer self-start
        ${isSubtask ? "text-[10px] py-1 px-2" : "text-[10px] pt-3 pb-1 px-1"}`}
    >
      <svg
        className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="3"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      Completed ({count})
    </button>
  );
}
