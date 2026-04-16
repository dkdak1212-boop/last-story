-- 장비 프리셋 (1~3 슬롯)
CREATE TABLE IF NOT EXISTS character_equip_presets (
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  preset_idx INT NOT NULL CHECK (preset_idx BETWEEN 1 AND 3),
  name TEXT NOT NULL DEFAULT '',
  slots JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (character_id, preset_idx)
);

-- 노드 프리셋 (1~3 슬롯)
CREATE TABLE IF NOT EXISTS character_node_presets (
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  preset_idx INT NOT NULL CHECK (preset_idx BETWEEN 1 AND 3),
  name TEXT NOT NULL DEFAULT '',
  node_ids INT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (character_id, preset_idx)
);
