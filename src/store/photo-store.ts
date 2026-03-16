import { create } from "zustand";

export const usePhotoStore = create((set) => ({
    photos: null,
    setPhotos: (newPhotos:any) => set({photos:newPhotos})
}))