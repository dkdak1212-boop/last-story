import { create } from 'zustand';
import type { Character, OfflineReport } from '../types';
import { api } from '../api/client';

interface CharacterState {
  characters: Character[];
  activeCharacter: Character | null;
  pendingReport: OfflineReport | null;
  isLoading: boolean;
  initialized: boolean;
  fetchCharacters: () => Promise<void>;
  selectCharacter: (id: number) => Promise<void>;
  createCharacter: (name: string, className: string) => Promise<Character>;
  ackReport: () => Promise<void>;
  refreshActive: () => Promise<void>;
  clear: () => void;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  activeCharacter: null,
  pendingReport: null,
  isLoading: false,
  initialized: false,

  fetchCharacters: async () => {
    set({ isLoading: true });
    try {
      const chars = await api<Character[]>('/characters');
      set({ characters: chars, isLoading: false, initialized: true });
    } catch (e) {
      set({ isLoading: false, initialized: true });
      throw e;
    }
  },

  selectCharacter: async (id) => {
    // 오프라인 정산 먼저
    const { report } = await api<{ report: OfflineReport | null }>(`/characters/${id}/resume`, {
      method: 'POST',
    });
    const char = await api<Character>(`/characters/${id}`);
    set({ activeCharacter: char, pendingReport: report });
  },

  createCharacter: async (name, className) => {
    const char = await api<Character>('/characters', {
      method: 'POST',
      body: JSON.stringify({ name, className }),
    });
    set((s) => ({ characters: [...s.characters, char] }));
    return char;
  },

  ackReport: async () => {
    const active = get().activeCharacter;
    if (!active) return;
    await api(`/characters/${active.id}/report/ack`, { method: 'POST' });
    set({ pendingReport: null });
  },

  refreshActive: async () => {
    const active = get().activeCharacter;
    if (!active) return;
    const char = await api<Character>(`/characters/${active.id}`);
    set({ activeCharacter: char });
  },

  clear: () => set({ characters: [], activeCharacter: null, pendingReport: null, initialized: false }),
}));
