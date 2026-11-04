import { useEffect, useEffectEvent, useRef, useState } from "react";

interface UseListDialogsOptions {
  showUnsavedPrompt: boolean;
  setShowUnsavedPrompt: (show: boolean) => void;
  showActivityModal: boolean;
  setShowActivityModal: (show: boolean) => void;
  isChangelogOpen: boolean;
  handleCloseChangelog: () => void;
  isProfileOpen: boolean;
  requestCloseProfile: () => void;
}

export function useListDialogs({
  showUnsavedPrompt,
  setShowUnsavedPrompt,
  showActivityModal,
  setShowActivityModal,
  isChangelogOpen,
  handleCloseChangelog,
  isProfileOpen,
  requestCloseProfile,
}: UseListDialogsOptions) {
  const [listToDelete, setListToDelete] = useState<{ id: string; name: string } | null>(null);
  const [listToRename, setListToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListInput, setNewListInput] = useState("");
  const [newListCategory, setNewListCategory] = useState("Checklist");
  const [customCategoryInput, setCustomCategoryInput] = useState("");

  const [listToEditCategory, setListToEditCategory] = useState<{ id: string; name: string; category?: string } | null>(null);
  const [editCategorySelection, setEditCategorySelection] = useState("Checklist");
  const [editCustomCategoryInput, setEditCustomCategoryInput] = useState("");

  const renameListInputRef = useRef<HTMLInputElement>(null);
  const createListInputRef = useRef<HTMLInputElement>(null);
  const editCategoryInputRef = useRef<HTMLInputElement>(null);

  const handleEscape = useEffectEvent(() => {
    if (showUnsavedPrompt) {
      setShowUnsavedPrompt(false);
    } else if (showActivityModal) {
      setShowActivityModal(false);
    } else if (isChangelogOpen) {
      handleCloseChangelog();
    } else if (isProfileOpen) {
      requestCloseProfile();
    } else {
      setListToRename(null);
      setListToDelete(null);
      setIsCreateListOpen(false);
      setListToEditCategory(null);
    }
  });

  const isAnyModalOpen =
    isProfileOpen ||
    isChangelogOpen ||
    !!listToRename ||
    !!listToDelete ||
    isCreateListOpen ||
    !!listToEditCategory ||
    showUnsavedPrompt ||
    showActivityModal;

  useEffect(() => {
    if (!isAnyModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleEscape();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAnyModalOpen]);

  useEffect(() => {
    if (listToRename) {
      renameListInputRef.current?.focus();
    }
  }, [listToRename]);

  useEffect(() => {
    if (isCreateListOpen) {
      createListInputRef.current?.focus();
    }
  }, [isCreateListOpen]);

  useEffect(() => {
    if (listToEditCategory && editCategorySelection === "Custom") {
      editCategoryInputRef.current?.focus();
    }
  }, [listToEditCategory, editCategorySelection]);

  return {
    listToDelete,
    setListToDelete,
    listToRename,
    setListToRename,
    renameInput,
    setRenameInput,
    isCreateListOpen,
    setIsCreateListOpen,
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
    renameListInputRef,
    createListInputRef,
    editCategoryInputRef,
    isAnyModalOpen,
  };
}
