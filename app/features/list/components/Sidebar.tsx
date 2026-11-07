import { Suspense, type Dispatch, type SetStateAction } from "react";
import { Await, Link, type FetcherWithComponents } from "react-router";
import { ProfileAvatar } from "~/components/profile-avatar";
import type { PendingDeleteRequest } from "../../../../shared";
import type { GuestList } from "../guest-lists";

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  isCreatingList: boolean;
  lists: GuestList[];
  activeListId: string | undefined;
  userId: string;
  pendingDeleteRequests: PendingDeleteRequest[];
  ownedPendingDeleteRequests?: Promise<PendingDeleteRequest[]>;
  providerProfile?: Promise<{ avatarUrl: string | null; suggestedDisplayName: string | null } | null>;
  setListToDelete: (list: { id: string; name: string } | null) => void;
  setListToRename: (list: { id: string; name: string } | null) => void;
  setRenameInput: (name: string) => void;
  settingsFetcher: FetcherWithComponents<unknown>;
  setIsCreateListOpen: (open: boolean) => void;
  isLoggedIn: boolean;
  settings?: {
    avatarUrl?: string | null;
    [key: string]: unknown;
  };
  profileLabel: {
    primary: string;
    secondary: string;
    initials: string;
  };
  setIsProfileOpen: (open: boolean) => void;
}

export function Sidebar({
  isSidebarOpen,
  setIsSidebarOpen,
  isCreatingList,
  lists,
  activeListId,
  userId,
  pendingDeleteRequests,
  ownedPendingDeleteRequests,
  providerProfile,
  setListToDelete,
  setListToRename,
  setRenameInput,
  settingsFetcher,
  setIsCreateListOpen,
  isLoggedIn,
  settings,
  profileLabel,
  setIsProfileOpen,
}: SidebarProps) {
  const myLists = lists.filter((l) => l.owner_id === userId);
  const sharedLists = lists.filter((l) => l.owner_id !== userId);

  const renderListRow = (list: GuestList, opts: { shared?: boolean }) => {
    const isActive = list.id === activeListId;
    const remainingCount = (list.todos || []).filter((t) => !t.completed).length;
    const pendingForList = (pendingDeleteRequests as PendingDeleteRequest[]).filter(
      (r) => r.listId === list.id
    ).length;
    const listPendingDelete = (pendingDeleteRequests as PendingDeleteRequest[]).some(
      (r) => r.listId === list.id && r.targetType === "list"
    );
    const shouldPrefetch = !isActive && (isLoggedIn || Boolean(opts.shared));
    return (
      <div
        key={list.id}
        className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-200 border
          ${isActive
            ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
            : "bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-themeCardHover"
          }`}
      >
        <Link
          to={`/${list.id}`}
          prefetch={shouldPrefetch ? "intent" : "none"}
          onClick={() => setIsSidebarOpen(false)}
          className="flex items-center gap-2.5 flex-1 min-w-0"
        >
          <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-themeAccentText" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-semibold truncate">{list.name}</span>
          {opts.shared && list.owner_display_name ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 font-medium shrink-0 truncate max-w-[7rem]">
              {list.owner_display_name}
            </span>
          ) : list.category ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 font-medium shrink-0">
              {list.category}
            </span>
          ) : null}
        </Link>

        <div className="flex items-center gap-1.5">
          {!opts.shared && (
            ownedPendingDeleteRequests ? (
              <Suspense fallback={null}>
                <Await resolve={ownedPendingDeleteRequests}>
                  {(resolvedPending) => {
                    const count = (resolvedPending || []).filter((r) => r.listId === list.id).length;
                    if (count <= 0) return null;
                    return (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300"
                        title={`${count} delete request${count === 1 ? "" : "s"} waiting`}
                      >
                        {count}
                      </span>
                    );
                  }}
                </Await>
              </Suspense>
            ) : pendingForList > 0 ? (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300"
                title={`${pendingForList} delete request${pendingForList === 1 ? "" : "s"} waiting`}
              >
                {pendingForList}
              </span>
            ) : null
          )}
          {remainingCount > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-themeAccentBg text-themeAccentText" : "bg-white/5 text-slate-400"}`}>
              {remainingCount}
            </span>
          )}

          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-200 bg-slate-900/80 px-1 py-0.5 rounded-md border border-white/5 shadow-sm absolute right-2">
            {opts.shared ? (
              <>
                {list.share_mode === "public_edit" && !listPendingDelete && (
                  <button
                    onClick={() => setListToDelete({ id: list.id, name: list.name })}
                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                    title="Request delete (owner must approve)"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
                {listPendingDelete && (
                  <span className="text-[9px] text-amber-300 px-1" title="Delete requested">
                    Pending
                  </span>
                )}
                <button
                  onClick={() => {
                    settingsFetcher.submit(
                      { intent: "removeSharedList", listId: list.id },
                      { method: "post" }
                    );
                  }}
                  className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                  title="Remove from Shared with me"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setListToRename({ id: list.id, name: list.name });
                    setRenameInput(list.name);
                  }}
                  className="text-slate-500 hover:text-themeAccentText p-0.5 rounded transition-colors"
                  title="Rename list"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                {myLists.length > 1 && (
                  <button
                    onClick={() => setListToDelete({ id: list.id, name: list.name })}
                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                    title="Delete list"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── Mobile Sidebar Overlay ───────────────────────── */}
      {isSidebarOpen && (
        <div
          role="presentation"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden cursor-pointer"
        />
      )}

      {/* ── Sidebar Component (Desktop and Mobile drawer) ──── */}
      <aside
        className={`fixed md:sticky top-0 left-0 bottom-0 z-40 md:z-10 h-full max-h-dvh md:h-screen md:max-h-screen w-[min(280px,85vw)] md:w-full md:max-w-none md:min-w-0 bg-themeSidebar border-r border-themeBorder p-5 flex flex-col justify-between overflow-hidden transition-transform duration-300 md:transform-none shadow-2xl md:shadow-none
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="flex-1 flex flex-col min-h-0">
          {/* Logo */}
          <div className="hidden md:flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-themeAccentFrom to-themeAccentTo flex items-center justify-center shadow-lg shadow-themeAccentFrom/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="font-extrabold text-xl bg-gradient-to-r from-white to-slate-350 bg-clip-text text-transparent tracking-tight font-display">sYnX</span>
          </div>

          {isCreatingList && (
            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 px-1 mb-4">
              <svg className="w-3.5 h-3.5 animate-spin text-themeAccentFrom" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating list...
            </div>
          )}

          {/* Lists Section — My lists vs Shared with me */}
          <div className="flex-1 flex flex-col min-h-0">
            <nav className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1 scrollbar-thin overscroll-contain">
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">My lists</h3>
                  <button
                    onClick={() => setIsCreateListOpen(true)}
                    className="text-slate-500 hover:text-themeAccentText p-1 rounded-md hover:bg-white/[0.04] transition-all duration-205 cursor-pointer bg-transparent"
                    title="Create new list"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-1">
                  {myLists.map((list) => renderListRow(list, {}))}
                  {myLists.length === 0 && (
                    <p className="text-[10px] text-slate-500 px-1 py-2">No lists yet</p>
                  )}
                </div>
              </div>
              {(isLoggedIn || sharedLists.length > 0) && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Shared with me</h3>
                  </div>
                  <div className="space-y-1">
                    {sharedLists.map((list) => renderListRow(list, { shared: true }))}
                    {sharedLists.length === 0 && (
                      <p className="text-[10px] text-slate-500 px-1 py-2">Open a shared link to add lists here</p>
                    )}
                  </div>
                </div>
              )}
            </nav>
          </div>
        </div>

        {/* User profile bottom widget */}
        <div className="border-t border-themeBorder pt-4 mt-4 relative z-10 shrink-0">
          {isLoggedIn ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {providerProfile ? (
                  <Suspense
                    fallback={
                      <ProfileAvatar
                        url={settings?.avatarUrl}
                        initials={profileLabel.initials}
                        className="w-8 h-8 rounded-full bg-themeAccentBg border border-themeAccentRing/30 flex items-center justify-center text-themeAccentText font-bold text-xs flex-shrink-0 shadow-inner select-none"
                      />
                    }
                  >
                    <Await resolve={providerProfile}>
                      {(profile) => (
                        <ProfileAvatar
                          url={profile?.avatarUrl ?? settings?.avatarUrl}
                          initials={profileLabel.initials}
                          className="w-8 h-8 rounded-full bg-themeAccentBg border border-themeAccentRing/30 flex items-center justify-center text-themeAccentText font-bold text-xs flex-shrink-0 shadow-inner select-none"
                        />
                      )}
                    </Await>
                  </Suspense>
                ) : (
                  <ProfileAvatar
                    url={settings?.avatarUrl}
                    initials={profileLabel.initials}
                    className="w-8 h-8 rounded-full bg-themeAccentBg border border-themeAccentRing/30 flex items-center justify-center text-themeAccentText font-bold text-xs flex-shrink-0 shadow-inner select-none"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-350 truncate">{profileLabel.primary}</p>
                  <p className="text-[9px] text-slate-500 font-medium truncate">{profileLabel.secondary}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-slate-400 hover:text-themeAccentText p-1.5 rounded-lg hover:bg-themeCardHover border border-transparent hover:border-white/5 transition-all duration-200 cursor-pointer"
                  title="Profile, Statistics & Themes"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <form action="/logout" method="post" className="inline">
                  <button
                    type="submit"
                    className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-200 cursor-pointer bg-transparent"
                    title="Sign Out"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Unsaved Guest</span>
                </div>
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-slate-400 hover:text-themeAccentText p-1 rounded-lg hover:bg-white/[0.04] transition-all duration-200 cursor-pointer bg-transparent"
                  title="Guest Statistics & Themes"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                </button>
              </div>
              <a
                href="/login"
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-white bg-gradient-to-r from-themeAccentFrom to-themeAccentTo hover:from-themeAccentFrom hover:to-themeAccentTo rounded-xl py-2.5 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-themeAccentFrom/20 active:scale-98"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign In to Save Lists
              </a>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
