import { ProfileAvatar } from "~/components/profile-avatar";
import { WEB_VERSION } from "~/constants/changelog";
import {
  PHONE_CARRIERS,
  describeTimeZone,
  isValidTimeZone,
} from "../../../../shared";

interface SettingsData {
  avatarUrl?: string | null;
  displayName?: string;
  displayNameSet?: boolean;
  timeZone?: string | null;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  phoneNumber?: string;
  phoneCarrier?: string;
  discordWebhookUrl?: string;
  suggestedDisplayName?: string | null;
  [key: string]: unknown;
}

interface ProfileModalProps {
  isProfileOpen: boolean;
  requestCloseProfile: () => void;
  profileLabel: {
    primary: string;
    secondary: string;
    initials: string;
  };
  settings?: SettingsData;
  displayNameInput: string;
  setDisplayNameInput: (name: string) => void;
  email: string;
  userId: string;
  showToast: (msg: string) => void;
  pendingNameSuggestion: string | null;
  acceptNameSuggestion: (name: string) => void;
  dismissNameSuggestion: () => void;
  isLoggedIn: boolean;
  homeTimeZoneInput: string;
  setHomeTimeZoneInput: (zone: string) => void;
  timeZoneOptions: string[];
  browserTimeZone: string;
  stats: {
    totalLists: number;
    totalTasks: number;
    completedTasks: number;
  };
  theme: string;
  changeTheme: (themeId: string) => void;
  emailEnabled: boolean;
  setEmailEnabled: (enabled: boolean) => void;
  smsEnabled: boolean;
  setSmsEnabled: (enabled: boolean) => void;
  phoneInput: string;
  setPhoneInput: (phone: string) => void;
  phoneCarrier: string;
  setPhoneCarrier: (carrier: string) => void;
  discordEnabled: boolean;
  setDiscordEnabled: (enabled: boolean) => void;
  discordInput: string;
  setDiscordInput: (url: string) => void;
  handleSaveSettings: () => boolean;
  setIsProfileOpen: (open: boolean) => void;
  setIsChangelogOpenedManually: (open: boolean) => void;
  handleExportData: () => void;
}

export function ProfileModal({
  isProfileOpen,
  requestCloseProfile,
  profileLabel,
  settings,
  displayNameInput,
  setDisplayNameInput,
  email,
  userId,
  showToast,
  pendingNameSuggestion,
  acceptNameSuggestion,
  dismissNameSuggestion,
  isLoggedIn,
  homeTimeZoneInput,
  setHomeTimeZoneInput,
  timeZoneOptions,
  browserTimeZone,
  stats,
  theme,
  changeTheme,
  emailEnabled,
  setEmailEnabled,
  smsEnabled,
  setSmsEnabled,
  phoneInput,
  setPhoneInput,
  phoneCarrier,
  setPhoneCarrier,
  discordEnabled,
  setDiscordEnabled,
  discordInput,
  setDiscordInput,
  handleSaveSettings,
  setIsProfileOpen,
  setIsChangelogOpenedManually,
  handleExportData,
}: ProfileModalProps) {
  if (!isProfileOpen) return null;

  return (
    <div
      role="presentation"
      onClick={requestCloseProfile}
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-center overflow-y-auto p-4 transition-all duration-300 cursor-pointer"
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        className="my-auto bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl p-6 relative overflow-hidden cursor-default"
      >
        {/* Glow design */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-themeAccentFrom/10 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={requestCloseProfile}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors bg-transparent cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Profile Detail */}
        <div className="flex flex-col items-center text-center mb-6">
          <ProfileAvatar
            url={settings?.avatarUrl}
            initials={profileLabel.initials}
            className="w-16 h-16 rounded-full bg-gradient-to-tr from-themeAccentFrom to-themeAccentTo flex items-center justify-center text-white font-extrabold text-xl shadow-xl shadow-themeAccentFrom/10 mb-3 border border-white/10 relative"
          >
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
          </ProfileAvatar>
          <h3 className="text-base font-bold text-slate-200 font-display">
            {displayNameInput.trim() || settings?.displayName || "sYnX user"}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-full">{email}</p>
          <div className="flex items-center gap-1.5 mt-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-mono text-slate-400 select-all">User ID: {userId}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(userId);
                showToast("✓ Copied User ID!");
              }}
              className="text-slate-500 hover:text-themeAccentText transition-colors bg-transparent"
              title="Copy User ID"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Display name */}
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Display name</h4>
        <div className="mb-6">
          {pendingNameSuggestion && !displayNameInput.trim() && (
            <div
              role="status"
              className="mb-2.5 rounded-lg border border-themeAccentRing/30 bg-themeAccentBg p-3 text-left"
            >
              <p className="text-xs text-slate-200">
                Use <span className="font-semibold">&ldquo;{pendingNameSuggestion}&rdquo;</span> as your display name? It will be visible to people you share lists with.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => acceptNameSuggestion(pendingNameSuggestion)}
                  className="text-[11px] font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-md px-2.5 py-1 transition-colors cursor-pointer"
                >
                  Use this name
                </button>
                <button
                  type="button"
                  onClick={dismissNameSuggestion}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 rounded-md px-2.5 py-1 border border-white/10 transition-colors cursor-pointer bg-transparent"
                >
                  No thanks
                </button>
              </div>
            </div>
          )}
          <input
            type="text"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value.slice(0, 64))}
            placeholder="sYnX user"
            maxLength={64}
            className="w-full rounded-lg bg-slate-950 border border-white/[0.08] text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
          />
          <p className="text-[10px] text-slate-500 mt-1.5">
            Shown to people who open your shared lists. Your email is never shared.
          </p>
        </div>

        {/* Home time zone (repeating reminders) */}
        {isLoggedIn && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Home time zone</h4>
            <div className="mb-6">
              <input
                type="text"
                list="home-time-zone-options"
                value={homeTimeZoneInput}
                onChange={(e) => setHomeTimeZoneInput(e.target.value.slice(0, 64))}
                placeholder="Search, e.g. America/Los_Angeles"
                aria-label="Home time zone"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg bg-slate-950 border border-white/[0.08] text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
              />
              <datalist id="home-time-zone-options">
                {timeZoneOptions.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              {browserTimeZone && browserTimeZone !== homeTimeZoneInput.trim() && (
                <button
                  type="button"
                  onClick={() => setHomeTimeZoneInput(browserTimeZone)}
                  className="mt-1.5 text-[11px] font-semibold text-themeAccentText hover:underline cursor-pointer"
                >
                  Use this browser&apos;s zone ({browserTimeZone})
                </button>
              )}
              <p className="text-[10px] text-slate-500 mt-1.5">
                Repeating tasks stay at the same local time in this zone, even when the clocks change.
                {isValidTimeZone(homeTimeZoneInput.trim()) ? ` Currently ${describeTimeZone(homeTimeZoneInput.trim())}.` : ""}
              </p>
            </div>
          </>
        )}

        {/* Statistics */}
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Usage Metrics</h4>
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-themeAccentText">{stats.totalLists}</div>
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Lists</div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-themeAccentText">{stats.totalTasks}</div>
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Tasks</div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-themeAccentText">
              {stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%
            </div>
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Done</div>
          </div>
        </div>

        {/* Theme Picker */}
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Color Themes</h4>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {[
            { id: "midnight", name: "Midnight Indigo", bg: "bg-[#020617] border-indigo-500/50" },
            { id: "emerald", name: "Emerald Forest", bg: "bg-emerald-950 border-emerald-500/50" },
            { id: "sunset", name: "Sunset Rose", bg: "bg-stone-900 border-rose-500/50" },
            { id: "cyberpunk", name: "Cyberpunk Neon", bg: "bg-black border-pink-500/50" },
            { id: "pastel", name: "Light Pastel", bg: "bg-amber-50 border-indigo-500/50" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => changeTheme(t.id)}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all duration-200 text-left
                ${theme === t.id
                  ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText shadow-md"
                  : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full border ${t.bg} flex-shrink-0`} />
              {t.name}
            </button>
          ))}
        </div>

        {/* Notification Settings */}
        <div className="mb-6">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Notification Channels</h4>
          {isLoggedIn ? (
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 flex flex-col gap-4 text-xs">
              {/* Email Channel */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-300">Email Notifications</p>
                  <p className="text-[10px] text-slate-500">
                    Receive alerts at {email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailEnabled(!emailEnabled)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none relative
                    ${emailEnabled ? "bg-themeAccentFrom" : "bg-slate-800"}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200
                    ${emailEnabled ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </div>

              <hr className="border-white/[0.04]" />

              {/* SMS Channel */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-300">SMS Notifications</p>
                    <p className="text-[10px] text-slate-500">Receive text alerts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSmsEnabled(!smsEnabled)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none relative
                      ${smsEnabled ? "bg-themeAccentFrom" : "bg-slate-800"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200
                      ${smsEnabled ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </div>
                {smsEnabled && (
                  <div className="flex flex-col gap-2">
                    <div className="flex rounded-lg bg-slate-950 border border-white/[0.08] overflow-hidden focus-within:ring-1 focus-within:ring-themeAccentRing/50">
                      <span className="bg-white/[0.04] text-slate-400 px-3 py-2 text-xs border-r border-white/[0.08] select-none flex items-center">
                        +1
                      </span>
                      <input
                        type="tel"
                        placeholder="10-digit number"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, "").substring(0, 10))}
                        className="w-full text-xs bg-transparent text-slate-350 px-3 py-2 focus:outline-none"
                        required
                        pattern="[0-9]{10}"
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <select
                        value={phoneCarrier}
                        onChange={(e) => setPhoneCarrier(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-white/[0.08] text-slate-400 text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 appearance-none bg-slate-955"
                      >
                        <option value="" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>-- Mobile Carrier (Optional / Twilio) --</option>
                        {PHONE_CARRIERS.map((carrier) => (
                          <option key={carrier.id} value={carrier.id} className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>{carrier.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <hr className="border-white/[0.04]" />

              {/* Discord Channel */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-300">Discord Webhook</p>
                    <p className="text-[10px] text-slate-500">Alert in your Discord channel</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiscordEnabled(!discordEnabled)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none relative
                      ${discordEnabled ? "bg-themeAccentFrom" : "bg-slate-800"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200
                      ${discordEnabled ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </div>
                {discordEnabled && (
                  <input
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={discordInput}
                    onChange={(e) => setDiscordInput(e.target.value)}
                    className="w-full text-xs rounded-lg bg-slate-950 border border-white/[0.08] text-slate-355 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
                  />
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveSettings}
                className="w-full mt-2 text-center text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl py-2.5 transition-all cursor-pointer shadow-md active:scale-[0.98]"
              >
                Save Preferences
              </button>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 flex flex-col items-center gap-2 text-xs text-center">
              <span className="text-[9px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider select-none">
                Sign In Required
              </span>
              <p className="text-slate-400 text-xs">
                Sign in to configure Email, SMS, and Discord task notifications.
              </p>
              <a
                href="/login"
                className="mt-1 inline-block text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl px-4 py-2 transition-all shadow-md active:scale-[0.98]"
              >
                Sign In
              </a>
            </div>
          )}
        </div>

        {/* Controls */}
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Options</h4>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setIsProfileOpen(false);
              setIsChangelogOpenedManually(true);
            }}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {WEB_VERSION}
              </span>
              What&apos;s new? / Version Log
            </span>
            <span className="text-[10px] text-slate-500">View</span>
          </button>

          <button
            onClick={handleExportData}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] rounded-xl px-4 py-3 transition-all duration-200"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-themeAccentText" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export All Lists (JSON)
            </span>
            <span className="text-[10px] text-slate-500">Download</span>
          </button>

          {isLoggedIn ? (
            <form action="/logout" method="post" className="w-full">
              <button
                type="submit"
                className="w-full flex items-center justify-between text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </span>
                <span className="text-[10px] text-rose-400/80">End Session</span>
              </button>
            </form>
          ) : (
            <a
              href="/login"
              className="w-full flex items-center justify-between text-xs font-semibold text-themeAccentText hover:text-themeAccentText bg-themeAccentBg hover:bg-themeAccentBg/20 border border-themeAccentRing/20 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign In to Save Indefinitely
              </span>
              <span className="text-[10px] text-themeAccentText/85">Persist Data</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
