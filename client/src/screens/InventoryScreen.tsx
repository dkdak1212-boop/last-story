import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { InventorySlot, Equipped } from '../types';
import { GRADE_COLOR, GRADE_LABEL, ItemStatsBlock } from '../components/ui/ItemStats';
import { ItemComparison } from '../components/ui/ItemComparison';
import { PrefixDisplay } from '../components/ui/PrefixDisplay';

const SLOT_LABEL: Record<string, string> = {
  weapon: '무기', helm: '투구', chest: '갑옷', boots: '장화',
  ring: '반지', amulet: '목걸이',
};

export function InventoryScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [inv, setInv] = useState<InventorySlot[]>([]);
  const [equipped, setEquipped] = useState<Equipped>({});

  async function refresh() {
    if (!active) return;
    const data = await api<{ inventory: InventorySlot[]; equipped: Equipped }>(
      `/characters/${active.id}/inventory`
    );
    setInv(data.inventory);
    setEquipped(data.equipped);
  }

  useEffect(() => {
    refresh();
  }, [active]);

  async function equip(slotIndex: number) {
    if (!active) return;
    await api(`/characters/${active.id}/equip`, {
      method: 'POST',
      body: JSON.stringify({ slotIndex }),
    });
    refresh();
  }

  async function unequip(slot: string) {
    if (!active) return;
    await api(`/characters/${active.id}/unequip`, {
      method: 'POST',
      body: JSON.stringify({ slot }),
    });
    refresh();
  }

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>인벤토리</h2>

      <h3 style={{ marginBottom: 10, fontSize: 16 }}>장착</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
        {(['weapon', 'helm', 'chest', 'boots', 'ring', 'amulet'] as const).map((s) => {
          const it = equipped[s];
          return (
            <div
              key={s}
              style={{
                padding: 10,
                background: 'var(--bg-panel)',
                border: `1px solid ${it ? GRADE_COLOR[it.grade] : 'var(--border)'}`,
                minHeight: 110,
                cursor: it ? 'pointer' : 'default',
              }}
              onClick={() => it && unequip(s)}
            >
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{SLOT_LABEL[s]}</div>
              {it ? (
                <>
                  <div style={{ color: GRADE_COLOR[it.grade], fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                    {it.name}
                  </div>
                  <ItemStatsBlock stats={it.stats} />
                  <PrefixDisplay prefixStats={(it as unknown as Record<string, unknown>).prefixStats as Record<string, number>} />
                </>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>비어있음</div>
              )}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginBottom: 10, fontSize: 16 }}>가방 ({inv.length})</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {inv.map((s) => (
          <div
            key={s.slotIndex}
            style={{
              padding: 10,
              background: 'var(--bg-panel)',
              border: `1px solid ${GRADE_COLOR[s.item.grade]}`,
              cursor: s.item.slot ? 'pointer' : 'default',
            }}
            onClick={() => s.item.slot && equip(s.slotIndex)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ color: GRADE_COLOR[s.item.grade], fontSize: 13, fontWeight: 700 }}>
                {s.item.name}
                {s.quantity > 1 && ` ×${s.quantity}`}
              </div>
              <span style={{ fontSize: 10, color: GRADE_COLOR[s.item.grade] }}>{GRADE_LABEL[s.item.grade]}</span>
            </div>
            {s.item.slot && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{SLOT_LABEL[s.item.slot]}</div>
            )}
            <div style={{ marginTop: 6 }}>
              <ItemStatsBlock stats={s.item.stats} />
              <PrefixDisplay prefixStats={(s as unknown as Record<string, unknown>).prefixStats as Record<string, number>} />
              {s.item.slot && (
                <ItemComparison
                  itemStats={s.item.stats}
                  equippedStats={equipped[s.item.slot]?.stats}
                />
              )}
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
              {s.item.description}
            </div>
          </div>
        ))}
        {inv.length === 0 && <div style={{ color: 'var(--text-dim)' }}>가방이 비어있다.</div>}
      </div>
    </div>
  );
}
