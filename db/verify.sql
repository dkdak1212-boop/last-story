SELECT i.name, i.type, i.slot FROM mailbox m JOIN items i ON i.id = m.item_id
WHERE m.character_id = 3 AND m.read_at IS NULL AND i.grade = 'epic'
ORDER BY i.type, i.name;
