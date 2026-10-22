import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { applyRoomEdits, formatArea, formatLength, roomLimits, validateLayout, type Layout, type PlotInput, type RoomEdit, type Unit } from '../engine';
import { en as t } from './strings';
import { colors, space, touch } from './theme';
import { Button, ChipGroup, Hint, LengthField, Title, ToggleRow } from './components';
import { PlanView } from './PlanView';

interface Props {
  layout: Layout;
  input: PlotInput;
  unit: Unit;
  onUnit: (u: Unit) => void;
}

export function ViewerScreen({ layout, input, unit, onUnit }: Props) {
  const [showSetbacks, setShowSetbacks] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [edits, setEdits] = useState<Record<string, RoomEdit>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const edited = useMemo(() => applyRoomEdits(layout, input, edits), [layout, input, edits]);
  const issues = useMemo(() => validateLayout(edited, input), [edited, input]);
  const issueRoomIds = useMemo(() => [...new Set(issues.map((i) => i.roomId).filter((x): x is string => !!x))], [issues]);
  const options = useMemo(
    () => ({ unit, showSetbacks, showDimensions, showFurniture, selectedRoomId: selectedId ?? undefined, issueRoomIds }),
    [unit, showSetbacks, showDimensions, showFurniture, selectedId, issueRoomIds],
  );
  const s = edited.scorecard;
  const editable = edited.rooms.filter((r) => r.kind !== 'passage' && roomLimits(input, r.id));
  const selected = selectedId ? edited.rooms.find((r) => r.id === selectedId) ?? null : null;

  return (
    <View style={styles.screen}>
      <View style={styles.planArea}>
        <PlanView layout={edited} options={options} resetKey={resetKey} />
        <Text style={styles.zoomHint}>{t.viewer.zoomHint}</Text>
      </View>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelPad}>
        <ChipGroup
          options={[{ value: 'ftin' as const, label: t.viewer.feetInches }, { value: 'm' as const, label: t.viewer.metres }]}
          value={unit}
          onChange={onUnit}
        />
        <ToggleRow label={t.viewer.setbacks} value={showSetbacks} onChange={setShowSetbacks} />
        <ToggleRow label={t.viewer.dimensions} value={showDimensions} onChange={setShowDimensions} />
        <ToggleRow label={t.viewer.furniture} value={showFurniture} onChange={setShowFurniture} />
        <Hint>{t.viewer.furnitureNote}</Hint>
        <Button label={t.viewer.reset} kind="ghost" onPress={() => { setResetKey((k) => k + 1); setSelectedId(null); }} />

        {issues.length > 0 ? (
          <View style={styles.issues}>
            <Text style={styles.issuesTitle}>{t.viewer.issues}</Text>
            {issues.map((i, k) => <Text key={k} style={styles.issueText}>• {i.message}</Text>)}
          </View>
        ) : (
          <Text style={styles.okText}>{t.viewer.noIssues}</Text>
        )}

        <Title>{t.viewer.editRooms}</Title>
        <Hint>{t.viewer.editHint}</Hint>
        <View style={styles.roomChips}>
          {editable.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setSelectedId(selectedId === r.id ? null : r.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === r.id }}
              style={[styles.roomChip, selectedId === r.id && styles.roomChipOn, issueRoomIds.includes(r.id) && styles.roomChipIssue]}
            >
              <Text style={[styles.roomChipText, selectedId === r.id && styles.roomChipTextOn]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        {selected ? (
          <RoomEditor
            key={selected.id}
            roomId={selected.id}
            label={selected.label}
            currentW={selected.rect.w}
            currentH={selected.rect.h}
            limits={roomLimits(input, selected.id)!}
            unit={unit}
            hasEdit={!!edits[selected.id]}
            onApply={(w, h) => setEdits({ ...edits, [selected.id]: { w, h } })}
            onReset={() => {
              const next = { ...edits };
              delete next[selected.id];
              setEdits(next);
            }}
          />
        ) : null}

        <Title>{t.viewer.scorecard}</Title>
        <Stat label={t.results.carpet} value={formatArea(s.carpetArea, unit)} />
        <Stat label={t.results.builtUp} value={formatArea(s.builtUpArea, unit)} />
        <Stat label={t.results.coverage} value={`${(s.groundCoverage * 100).toFixed(0)}%`} />
        <Stat label={t.results.efficiency} value={`${s.efficiency.toFixed(0)}%`} />
        <Stat label={t.results.ventilation} value={`${s.ventilation.toFixed(0)} / 100`} />
        <Stat label={t.results.vastu} value={s.vastu === null ? t.results.notApplied : `${s.vastu.toFixed(0)} / 100`} />

        {layout.warnings.length > 0 ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>{t.viewer.warnings}</Text>
            {layout.warnings.map((w) => <Text key={w} style={styles.noteText}>• {w}</Text>)}
          </View>
        ) : null}
        <Hint>{t.viewer.disclaimer}</Hint>
      </ScrollView>
    </View>
  );
}

function RoomEditor({
  roomId, label, currentW, currentH, limits, unit, hasEdit, onApply, onReset,
}: {
  roomId: string; label: string; currentW: number; currentH: number;
  limits: { minW: number; minH: number; maxW: number; maxH: number };
  unit: Unit; hasEdit: boolean;
  onApply: (w: number, h: number) => void; onReset: () => void;
}) {
  const [w, setW] = useState(currentW);
  const [h, setH] = useState(currentH);
  const fmt = (ft: number) => formatLength(ft, unit);
  return (
    <View style={styles.editor} accessibilityLabel={`Edit ${label}`}>
      <Text style={styles.editorTitle}>{label}</Text>
      <Hint>{t.viewer.limits(`${fmt(limits.minW)} x ${fmt(limits.minH)}`, `${fmt(limits.maxW)} x ${fmt(limits.maxH)}`)}</Hint>
      <LengthField key={`w-${roomId}`} label={t.viewer.width} valueFt={w} unit={unit} invalidText={t.errors.badLength} onChange={setW} />
      <LengthField key={`h-${roomId}`} label={t.viewer.height} valueFt={h} unit={unit} invalidText={t.errors.badLength} onChange={setH} />
      <Button label={t.viewer.apply} onPress={() => onApply(w, h)} />
      {hasEdit ? <Button label={t.viewer.resetRoom} kind="ghost" onPress={onReset} /> : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  planArea: { flex: 3, backgroundColor: '#ffffff', borderBottomWidth: 1, borderColor: colors.line },
  zoomHint: { position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: colors.muted },
  panel: { flex: 2 },
  panelPad: { padding: space.md, paddingBottom: space.lg * 2 },
  stat: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statLabel: { fontSize: 15, color: colors.muted },
  statValue: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  issues: { backgroundColor: '#fbe9e7', borderRadius: 10, padding: space.md, marginVertical: space.sm, borderWidth: 1, borderColor: colors.danger },
  issuesTitle: { fontSize: 15, fontWeight: '700', color: colors.danger, marginBottom: 4 },
  issueText: { fontSize: 14, color: colors.danger, marginBottom: 4 },
  okText: { fontSize: 14, color: colors.primary, fontWeight: '600', marginVertical: space.sm },
  roomChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  roomChip: { minHeight: touch - 8, paddingHorizontal: space.md, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, justifyContent: 'center' },
  roomChipOn: { backgroundColor: '#d08a00', borderColor: '#d08a00' },
  roomChipIssue: { borderColor: colors.danger, borderWidth: 2 },
  roomChipText: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  roomChipTextOn: { color: '#ffffff' },
  editor: { backgroundColor: colors.card, borderRadius: 12, padding: space.md, borderWidth: 1, borderColor: colors.line, marginBottom: space.md },
  editorTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  notes: { backgroundColor: colors.accent, borderRadius: 10, padding: space.md, marginVertical: space.sm },
  notesTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  noteText: { fontSize: 14, color: colors.ink, marginBottom: 4 },
});
