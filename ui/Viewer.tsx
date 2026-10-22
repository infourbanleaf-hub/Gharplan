import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Layout, Unit } from '../engine';
import { formatArea } from '../engine';
import { en as t } from './strings';
import { colors, space } from './theme';
import { Button, Hint, ToggleRow, Title } from './components';
import { PlanView } from './PlanView';
import { ChipGroup } from './components';

export function ViewerScreen({ layout, unit, onUnit }: { layout: Layout; unit: Unit; onUnit: (u: Unit) => void }) {
  const [showSetbacks, setShowSetbacks] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const options = useMemo(() => ({ unit, showSetbacks, showDimensions }), [unit, showSetbacks, showDimensions]);
  const s = layout.scorecard;
  return (
    <View style={styles.screen}>
      <View style={styles.planArea}>
        <PlanView layout={layout} options={options} resetKey={resetKey} />
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
        <ToggleRow label={t.viewer.furniture} value={false} disabled onChange={() => undefined} />
        <Hint>{t.viewer.furnitureSoon}</Hint>
        <Button label={t.viewer.reset} kind="ghost" onPress={() => setResetKey((k) => k + 1)} />

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
  notes: { backgroundColor: colors.accent, borderRadius: 10, padding: space.md, marginVertical: space.sm },
  notesTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  noteText: { fontSize: 14, color: colors.ink, marginBottom: 4 },
});
