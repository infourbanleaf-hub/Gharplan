import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import type { GenerationResult, Layout, Unit } from '../engine';
import { formatArea } from '../engine';
import { en as t } from './strings';
import { colors, space } from './theme';
import { Button, Card, Hint, Title } from './components';

export function GeneratingView() {
  return (
    <View style={styles.center}>
      <Text style={styles.big}>{t.generating}</Text>
      <Text style={styles.hint}>{t.generatingHint}</Text>
    </View>
  );
}

export function ResultsView({
  result, unit, onView, onSave, onEdit, saved,
}: {
  result: GenerationResult;
  unit: Unit;
  onView: (index: number) => void;
  onSave: () => void;
  onEdit: () => void;
  saved: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Title>{t.results.title}</Title>
      {result.errors.map((e) => <Text key={e} style={styles.error}>{e}</Text>)}
      {result.layouts.length === 0 && result.errors.length === 0 ? <Hint>{t.results.none}</Hint> : null}
      {result.layouts.map((l, i) => (
        <LayoutCard key={l.id} layout={l} unit={unit} index={i} onView={onView} />
      ))}
      {result.warnings.length > 0 ? (
        <View style={styles.notes}>
          {result.warnings.map((w) => <Text key={w} style={styles.noteText}>• {w}</Text>)}
        </View>
      ) : null}
      <Button label={saved ? t.results.saved : t.results.savePlan} onPress={onSave} disabled={saved || result.layouts.length === 0} />
      <Button label={t.results.editInputs} kind="ghost" onPress={onEdit} />
      <Hint>{t.viewer.disclaimer}</Hint>
    </ScrollView>
  );
}

function LayoutCard({ layout, unit, index, onView }: { layout: Layout; unit: Unit; index: number; onView: (i: number) => void }) {
  const s = layout.scorecard;
  return (
    <Card onPress={() => onView(index)}>
      <Text style={styles.cardTitle}>{t.results.layout(layout.id.replace('L', ''))}</Text>
      <Row label={t.results.carpet} value={formatArea(s.carpetArea, unit)} />
      <Row label={t.results.builtUp} value={formatArea(s.builtUpArea, unit)} />
      <Row label={t.results.coverage} value={`${(s.groundCoverage * 100).toFixed(0)}%`} />
      <Row label={t.results.efficiency} value={`${s.efficiency.toFixed(0)}%`} />
      <Row label={t.results.ventilation} value={`${s.ventilation.toFixed(0)} / 100`} />
      <Row label={t.results.vastu} value={s.vastu === null ? t.results.notApplied : `${s.vastu.toFixed(0)} / 100`} />
      <Button label={t.results.viewPlan} onPress={() => onView(index)} />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, paddingBottom: space.lg * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  big: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: space.sm },
  hint: { fontSize: 14, color: colors.muted },
  error: { color: colors.danger, fontSize: 15, marginBottom: space.sm },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 15, color: colors.muted },
  rowValue: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  notes: { backgroundColor: colors.accent, borderRadius: 10, padding: space.md, marginVertical: space.sm },
  noteText: { fontSize: 14, color: colors.ink, marginBottom: 4 },
});
