import { create } from 'zustand';

interface TagLinkStore {
  open: boolean;
  /** 打开时预置选中的 tag（从右栏某个节点的标签直接带过来） */
  tags: string[];
  openDialog: (tags?: string[]) => void;
  closeDialog: () => void;
  setTags: (tags: string[]) => void;
  toggleTag: (tag: string) => void;
}

export const useTagLinkStore = create<TagLinkStore>((set) => ({
  open: false,
  tags: [],
  openDialog: (tags) => set({ open: true, tags: tags ? tags.filter((tag, index) => tags.indexOf(tag) === index) : [] }),
  closeDialog: () => set({ open: false }),
  setTags: (tags) => set({ tags }),
  toggleTag: (tag) =>
    set((state) => ({
      tags: state.tags.includes(tag) ? state.tags.filter((item) => item !== tag) : [...state.tags, tag],
    })),
}));
