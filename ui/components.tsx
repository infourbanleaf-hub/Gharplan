import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { parseFeetInches, formatLength, type Unit } from '../engine';
import { colors, space, touch } from './theme';

export function Title({ children }: { children: string }) {
  return <Text style={styles.title} accessibilityRole="header">{children}</Text>;
}

export function Hint({ children }: { children: string }) {
  return <Text style={styles.hint}>{children}</Text>;
}

export function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

/** Feet-inches input. Keeps the typed text; reports a value only when it parses. */
export function LengthField({
  label, valueFt, unit, onChange, invalidText,
}: { label: string; valueFt: number; unit: Unit; onChange: (ft: number) => void; invalidText: string }) {
  const shown = unit === 'm' ? (valueFt / 3.28084).toFixed(2) : formatLength(valueFt, 'ftin');
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(shown);
    setBad(false);
  }, [shown]);
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          const ft = unit === 'm' ? Number(t) * 3.28084 : parseFeetInches(t);
          const ok = ft !== null && Number.isFinite(ft) && ft > 0;
          setBad(!ok);
          if (ok) onChange(ft as number);
        }}
        keyboardType="default"
        style={[styles.input, bad && styles.inputBad]}
        accessibilityLabel={label}
      />
      {bad ? <Text style={styles.error}>{invalidText}</Text> : null}
    </View>
  );
}


export function ChipGroup<T extends string | number>({
  options, value, onChange, columns,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; columns?: number }) {
  return (
    <View style={[styles.chipWrap, columns ? { width: '100%' } : null]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn, columns ? { width: `${100 / columns - 2}%` } : null]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.toggleRow, disabled && { opacity: 0.5 }]}>
      <Text style={styles.toggleText}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.primary }} />
    </View>
  );
}

export function Button({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        kind === 'ghost' ? styles.buttonGhost : styles.buttonPrimary,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={kind === 'ghost' ? styles.buttonGhostText : styles.buttonPrimaryText}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar">
      <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
    </View>
  );
}

export function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.card}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.ink, marginBottom: space.md },
  hint: { fontSize: 14, color: colors.muted, marginBottom: space.sm, lineHeight: 20 },
  label: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: space.xs },
  field: { marginBottom: space.md },
  input: {
    minHeight: touch, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: space.md, fontSize: 17, color: colors.ink, backgroundColor: colors.card,
  },
  inputBad: { borderColor: colors.danger },
  error: { color: colors.danger, marginTop: space.xs, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: {
    minHeight: touch, minWidth: touch, paddingHorizontal: space.md, borderRadius: 24,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  chipTextOn: { color: colors.primaryInk },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: touch, borderBottomWidth: 1, borderColor: colors.line,
  },
  toggleText: { fontSize: 16, color: colors.ink, flex: 1, paddingRight: space.sm },
  button: { minHeight: touch, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, marginVertical: space.xs },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonPrimaryText: { color: colors.primaryInk, fontSize: 17, fontWeight: '700' },
  buttonGhost: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card },
  buttonGhostText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', marginBottom: space.md },
  progressFill: { height: 8, backgroundColor: colors.primary },
  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: space.md, marginBottom: space.md,
    borderWidth: 1, borderColor: colors.line,
  },
});
