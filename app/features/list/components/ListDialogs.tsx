import type { RefObject } from "react";
import type { FetcherWithComponents } from "@remix-run/react";
import type { GuestActionPayload } from "~/guest-context";
import { MAX_CATEGORY_LENGTH, MAX_LIST_NAME_LENGTH } from "~/write-limits";
import type { GuestList } from "../guest-lists";

interface ListDialogsProps {
  showUnsavedPrompt: boolean;
  setShowUnsavedPrompt: (show: boolean) => void;
  resetSettings: () => void;
  setIsProfileOpen: (open: boolean) => void;
  handleSaveSettings: () => boolean;

  listToRename: { id: string; name: string } | null;
  setListToRename: (val: { id: string; name: string } | null) => void;
  renameInput: string;
  setRenameInput: (val: string) => void;
  renameListInputRef: RefObject<HTMLInputElement | null>;

  isLoggedIn: boolean;
  isSharedServerList: boolean;
  handleGuestAction: (intent: string, payload?: GuestActionPayload) => void;
  listFetcher: FetcherWithComponents<unknown>;

  listToDelete: { id: string; name: string } | null;
  setListToDelete: (val: { id: string; name: string } | null) => void;
  lists: GuestList[];
  userId: string;
  guestLists: GuestList[];
  navigate: (to: string) => void;

  isCreateListOpen: boolean;
  setIsCreateListOpen: (open: boolean) => void;
  createListInputRef: RefObject<HTMLInputElement | null>;
  newListInput: string;
  setNewListInput: (val: string) => void;
  newListCategory: string;
  setNewListCategory: (val: string) => void;
  customCategoryInput: string;
  setCustomCategoryInput: (val: string) => void;

  listToEditCategory: { id: string; name: string; category?: string } | null;
  setListToEditCategory: (val: { id: string; name: string; category?: string } | null) => void;
  editCategorySelection: string;
  setEditCategorySelection: (val: string) => void;
  editCustomCategoryInput: string;
  setEditCustomCategoryInput: (val: string) => void;
  editCategoryInputRef: RefObject<HTMLInputElement | null>;
}

export function ListDialogs({
  showUnsavedPrompt,
  setShowUnsavedPrompt,
  resetSettings,
  setIsProfileOpen,
  handleSaveSettings,

  listToRename,
  setListToRename,
  renameInput,
  setRenameInput,
  renameListInputRef,

  isLoggedIn,
  isSharedServerList,
  handleGuestAction,
  listFetcher,

  listToDelete,
  setListToDelete,
  lists,
  userId,
  guestLists,
  navigate,

  isCreateListOpen,
  setIsCreateListOpen,
  createListInputRef,
  newListInput,
  setNewListInput,
  newListCategory,
  setNewListCategory,
  customCategoryInput,
  setCustomCategoryInput,

  listToEditCategory,
  setListToEditCategory,
  editCategorySelection,
  setEditCategorySelection,
  editCustomCategoryInput,
  setEditCustomCategoryInput,
  editCategoryInputRef,
}: ListDialogsProps) {
  return (
    <>
      {/* ── Unsaved Settings Prompt Modal ────────────────────── */}
      {showUnsavedPrompt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-100 font-display mb-2">Unsaved Notification Settings</h3>
            <p className="text-xs text-slate-400 mb-6">
              You have unsaved changes to your notification preferences. Would you like to save or discard your changes before exiting?
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowUnsavedPrompt(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetSettings();
                  setShowUnsavedPrompt(false);
                  setIsProfileOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => {
                  const saved = handleSaveSettings();
                  if (saved) {
                    setShowUnsavedPrompt(false);
                    setIsProfileOpen(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo shadow-md transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename List Dialog Modal ──────────────────────── */}
      {listToRename && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-200 mb-3 font-display">Rename List</h3>
            <input
              ref={renameListInputRef}
              type="text"
              value={renameInput}
              maxLength={MAX_LIST_NAME_LENGTH}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition-all duration-200 mb-5"
              placeholder="Enter new list name..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (renameInput.trim()) {
                    if (!isLoggedIn && !isSharedServerList) {
                      handleGuestAction("renameList", { listId: listToRename.id, newName: renameInput.trim() });
                    } else {
                      listFetcher.submit(
                        { intent: "renameList", listId: listToRename.id, newName: renameInput.trim() },
                        { method: "post" }
                      );
                    }
                  }
                  setListToRename(null);
                }
              }}
            />
            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setListToRename(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (renameInput.trim()) {
                    if (!isLoggedIn && !isSharedServerList) {
                      handleGuestAction("renameList", { listId: listToRename.id, newName: renameInput.trim() });
                    } else {
                      listFetcher.submit(
                        { intent: "renameList", listId: listToRename.id, newName: renameInput.trim() },
                        { method: "post" }
                      );
                    }
                  }
                  setListToRename(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl shadow-lg transition-all duration-200"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete List Dialog Modal ──────────────────────── */}
      {listToDelete && (() => {
        const deletingOwned =
          !isLoggedIn ||
          lists.find((l) => l.id === listToDelete.id)?.owner_id === userId;
        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
              <h3 className="text-base font-bold text-slate-200 mb-2 font-display">
                {deletingOwned ? "Delete this list?" : "Request list deletion?"}
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                {deletingOwned ? (
                  <>
                    Are you sure you want to delete <span className="text-rose-400 font-semibold">&quot;{listToDelete.name}&quot;</span>? This will permanently delete all tasks inside this list. This action is irreversible.
                  </>
                ) : (
                  <>
                    Ask the owner to delete <span className="text-rose-400 font-semibold">&quot;{listToDelete.name}&quot;</span>? They&apos;ll need to approve before the list is removed.
                  </>
                )}
              </p>
              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setListToDelete(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isLoggedIn && !isSharedServerList) {
                      handleGuestAction("deleteList", { listId: listToDelete.id });
                      const remaining = guestLists.filter((l) => l.id !== listToDelete.id);
                      if (remaining.length > 0) {
                        navigate(`/${remaining[0].id}`);
                      } else {
                        navigate(`/${userId}`);
                      }
                      setListToDelete(null);
                    } else {
                      listFetcher.submit(
                        { intent: "deleteList", listId: listToDelete.id },
                        { method: "post" }
                      );
                      setListToDelete(null);
                    }
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-lg transition-all duration-200"
                >
                  {deletingOwned ? "Delete List" : "Send request"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Create List Dialog Modal ──────────────────────── */}
      {isCreateListOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-200 mb-3 font-display">Create New List</h3>
            
            <label htmlFor="create-list-name" className="block text-xs font-semibold text-slate-400 mb-1.5">List Name</label>
            <input
              id="create-list-name"
              ref={createListInputRef}
              type="text"
              value={newListInput}
              maxLength={MAX_LIST_NAME_LENGTH}
              onChange={(e) => setNewListInput(e.target.value)}
              className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition-all duration-200 mb-4"
              placeholder="Enter list name (e.g., Shopping, Work)..."
            />

            <span className="block text-xs font-semibold text-slate-400 mb-1.5">Select Category Tag</span>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {["Checklist", "Study", "Shopping", "Movies", "Work", "Personal", "Travel", "Fitness", "Custom"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setNewListCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium cursor-pointer transition-all ${
                    newListCategory === cat
                      ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText font-bold shadow-sm"
                      : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cat === "Custom" ? "✏️ Custom" : cat}
                </button>
              ))}
            </div>

            {newListCategory === "Custom" && (
              <div className="mb-4">
                <label htmlFor="create-list-custom-category" className="block text-xs font-semibold text-slate-400 mb-1">Custom Category Name</label>
                <input
                  id="create-list-custom-category"
                  type="text"
                  value={customCategoryInput}
                  maxLength={MAX_CATEGORY_LENGTH}
                  onChange={(e) => setCustomCategoryInput(e.target.value)}
                  className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
                  placeholder="e.g. Project Alpha..."
                />
              </div>
            )}

            <div className="flex gap-2.5 justify-end mt-2">
              <button
                type="button"
                onClick={() => {
                  setNewListInput("");
                  setCustomCategoryInput("");
                  setIsCreateListOpen(false);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newListInput.trim()) {
                    const finalCategory = newListCategory === "Custom" ? (customCategoryInput.trim() || "Custom") : newListCategory;
                    if (!isLoggedIn) {
                      const newId = crypto.randomUUID();
                      handleGuestAction("createList", { id: newId, name: newListInput.trim(), category: finalCategory });
                      setNewListInput("");
                      setCustomCategoryInput("");
                      setIsCreateListOpen(false);
                      navigate(`/${newId}`);
                    } else {
                      listFetcher.submit(
                        { intent: "createList", listName: newListInput.trim(), category: finalCategory },
                        { method: "post" }
                      );
                      setNewListInput("");
                      setCustomCategoryInput("");
                      setIsCreateListOpen(false);
                    }
                  } else {
                    setNewListInput("");
                    setCustomCategoryInput("");
                    setIsCreateListOpen(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl shadow-lg transition-all duration-200"
              >
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit List Category Modal ──────────────────────── */}
      {listToEditCategory && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-200 mb-1 font-display">Edit Category Tag</h3>
            <p className="text-xs text-slate-400 mb-4">Set or update the category tag for &quot;{listToEditCategory.name}&quot;</p>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {["Checklist", "Study", "Shopping", "Movies", "Work", "Personal", "Travel", "Fitness", "Custom"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setEditCategorySelection(cat)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium cursor-pointer transition-all ${
                    editCategorySelection === cat
                      ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText font-bold shadow-sm"
                      : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cat === "Custom" ? "✏️ Custom" : cat}
                </button>
              ))}
            </div>

            {editCategorySelection === "Custom" && (
              <div className="mb-4">
                <label htmlFor="edit-list-custom-category" className="block text-xs font-semibold text-slate-400 mb-1">Custom Category Name</label>
                <input
                  id="edit-list-custom-category"
                  ref={editCategoryInputRef}
                  type="text"
                  value={editCustomCategoryInput}
                  maxLength={MAX_CATEGORY_LENGTH}
                  onChange={(e) => setEditCustomCategoryInput(e.target.value)}
                  className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
                  placeholder="e.g. Special Project..."
                />
              </div>
            )}

            <div className="flex gap-2.5 justify-end mt-2">
              <button
                type="button"
                onClick={() => setListToEditCategory(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalCategory = editCategorySelection === "Custom" ? (editCustomCategoryInput.trim() || "Custom") : editCategorySelection;
                  if (!isLoggedIn) {
                    handleGuestAction("updateListCategory", { id: listToEditCategory.id, category: finalCategory });
                  } else {
                    listFetcher.submit(
                      { intent: "updateListCategory", listId: listToEditCategory.id, category: finalCategory },
                      { method: "post" }
                    );
                  }
                  setListToEditCategory(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl shadow-lg transition-all duration-200"
              >
                Save Category
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
