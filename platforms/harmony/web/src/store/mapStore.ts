import { create } from 'zustand';

/**
 * T7：地图「点选设坐标」模式。
 * 右栏或地图侧的按钮把实体 id 放进来，MapView 在点击地图时反算经纬度并写回，
 * 写回后自动清空——这是个一次性的取点动作，不需要常驻状态。
 */
interface MapStore {
  pickNodeId: string | null;
  requestPick: (id: string) => void;
  cancelPick: () => void;
}

export const useMapStore = create<MapStore>((set) => ({
  pickNodeId: null,
  requestPick: (pickNodeId) => set({ pickNodeId }),
  cancelPick: () => set({ pickNodeId: null }),
}));
