import { WEB_CHANGELOG, WEB_VERSION } from "~/constants/changelog";
import { sortChangelogItems } from "../../../../shared";

interface WhatsNewModalProps {
  isChangelogOpen: boolean;
  handleCloseChangelog: () => void;
}

export function WhatsNewModal({
  isChangelogOpen,
  handleCloseChangelog,
}: WhatsNewModalProps) {
  if (!isChangelogOpen) return null;

  return (
    <div
      role="presentation"
      onClick={handleCloseChangelog}
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-center overflow-y-auto p-4 transition-all duration-300 cursor-pointer"
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        className="my-auto bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl p-6 relative overflow-hidden cursor-default text-slate-100"
      >
        {/* Glow design */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="flex items-center justify-between mb-4 border-b border-white/[0.08] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-extrabold text-slate-100 font-display">What&apos;s new?</h3>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                {WEB_VERSION}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Latest updates, features & fixes</p>
          </div>
          <button
            onClick={handleCloseChangelog}
            className="text-slate-400 hover:text-slate-200 transition-colors bg-transparent cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Changes list */}
        <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-5 custom-scrollbar mb-5">
          {WEB_CHANGELOG.map((release) => (
            <div key={release.version} className="space-y-2">
              <div className="flex items-center gap-2 border-b border-white/[0.04] pb-1">
                <span className="text-xs font-extrabold text-emerald-400">{release.version}</span>
                {release.date && <span className="text-[10px] text-slate-500">{release.date}</span>}
              </div>
              <div className="space-y-2.5">
                {sortChangelogItems(release.changes).map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs">
                    <span
                      className={`inline-flex items-center justify-center shrink-0 w-11 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-center ${
                        item.type === "NEW"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : item.type === "IMPR"
                          ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-slate-300 leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleCloseChangelog}
          className="w-full text-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl py-3 transition-all cursor-pointer shadow-md active:scale-[0.98]"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
