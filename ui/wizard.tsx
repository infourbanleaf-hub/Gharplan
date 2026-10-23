import React, { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { defaultSetbacks, roomConfig, type Compass, type PlotInput, type RoomKind, type Unit } from '../engine';
import { en as t } from './strings';
import { colors, space } from './theme';
import { ChipGroup, Hint, Label, LengthField, Title, ToggleRow } from './components';

export interface StepProps {
  input: PlotInput;
  setInput: (next: PlotInput) => void;
  unit: Unit;
}

const COMPASS: { value: Compass; label: string }[] = [
  { value: 'N', label: 'N' }, { value: 'NE', label: 'NE' }, { value: 'E', label: 'E' }, { value: 'SE', label: 'SE' },
  { value: 'S', label: 'S' }, { value: 'SW', label: 'SW' }, { value: 'W', label: 'W' }, { value: 'NW', label: 'NW' },
];

export function PlotStep({ input, setInput, unit }: StepProps) {
  const defaults = defaultSetbacks(input);
  const sb = { ...defaults, ...input.setbacks };
  const setSetback = (key: keyof typeof sb, ft: number) =>
    setInput({ ...input, setbacks: { ...input.setbacks, [key]: ft } });
  return (
    <View>
      <Title>{t.plot.title}</Title>
      <LengthField label={t.plot.width} valueFt={input.width} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setInput({ ...input, width: ft })} />
      <LengthField label={t.plot.depth} valueFt={input.depth} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setInput({ ...input, depth: ft })} />

      <Label>{t.plot.facing}</Label>
      <ChipGroup options={COMPASS} value={input.facing} onChange={(v) => setInput({ ...input, facing: v })} />
      <Hint>{t.plot.facingHint}</Hint>

      <Label>{t.plot.roadSide}</Label>
      <ChipGroup
        options={[{ value: 'front' as const, label: t.plot.roadFront }, { value: 'corner' as const, label: t.plot.roadCorner }]}
        value={input.roadSide}
        onChange={(v) => setInput({ ...input, roadSide: v })}
      />
      {input.roadSide === 'corner' ? (
        <>
          <Label>{t.plot.cornerSide}</Label>
          <ChipGroup
            options={[{ value: 'left' as const, label: t.plot.left }, { value: 'right' as const, label: t.plot.right }]}
            value={input.cornerSide}
            onChange={(v) => setInput({ ...input, cornerSide: v })}
          />
        </>
      ) : null}

      <Label>{t.plot.setbacks}</Label>
      <Hint>{t.plot.setbacksHint}</Hint>
      <LengthField label={t.plot.front} valueFt={sb.front} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setSetback('front', ft)} />
      <LengthField label={t.plot.rear} valueFt={sb.rear} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setSetback('rear', ft)} />
      <LengthField label={t.plot.sideLeft} valueFt={sb.left} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setSetback('left', ft)} />
      <LengthField label={t.plot.sideRight} valueFt={sb.right} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setSetback('right', ft)} />
    </View>
  );
}

export function BuildingStep({ input, setInput }: StepProps) {
  return (
    <View>
      <Title>{t.building.title}</Title>
      <Label>{t.building.floors}</Label>
      <ChipGroup
        options={[{ value: 1 as const, label: t.building.ground }, { value: 2 as const, label: t.building.groundPlus1 }]}
        value={input.floors}
        onChange={(v) => setInput({ ...input, floors: v })}
      />
      <Label>{t.building.cars}</Label>
      <ChipGroup
        options={[{ value: 0 as const, label: 'None' }, { value: 1 as const, label: '1' }]}
        value={input.parking.cars}
        onChange={(v) => setInput({ ...input, parking: { ...input.parking, cars: v } })}
      />
      <Label>{t.building.twoWheelers}</Label>
      <ChipGroup
        options={[{ value: 0 as const, label: 'None' }, { value: 1 as const, label: '1' }, { value: 2 as const, label: '2' }]}
        value={input.parking.twoWheelers}
        onChange={(v) => setInput({ ...input, parking: { ...input.parking, twoWheelers: v } })}
      />
      <Label>{t.building.staircase}</Label>
      <ChipGroup
        options={[{ value: 'internal' as const, label: t.building.internal }, { value: 'external' as const, label: t.building.external }]}
        value={input.staircase}
        onChange={(v) => setInput({ ...input, staircase: v })}
      />
    </View>
  );
}

const ROOM_KINDS: RoomKind[] = ['living', 'dining', 'kitchen', 'master', 'bedroom', 'attachedToilet', 'commonToilet', 'puja', 'study', 'guest', 'store', 'utility'];
const ROOM_NAMES: Partial<Record<RoomKind, string>> = {
  living: 'Living', dining: 'Dining', kitchen: 'Kitchen', master: 'Master bedroom', bedroom: 'Bedroom',
  attachedToilet: 'Attached toilet', commonToilet: 'Common toilet', puja: 'Puja', study: 'Study', guest: 'Guest bedroom',
  store: 'Store', utility: 'Utility / wash',
};

export function RoomsStep({ input, setInput, unit }: StepProps) {
  const [showSizes, setShowSizes] = useState(false);
  const bedroomNames = Array.from({ length: input.bhk }, (_, i) => (i === 0 ? t.rooms.master : `${t.rooms.bedroom} ${i + 1}`));
  const activeKinds = ROOM_KINDS.filter((k) => {
    if (k === 'dining') return input.rooms.dining;
    if (k === 'puja') return input.rooms.puja;
    if (k === 'study') return input.rooms.study;
    if (k === 'guest') return input.rooms.guestBedroom;
    if (k === 'store') return input.rooms.store;
    if (k === 'utility') return input.rooms.utility;
    if (k === 'commonToilet') return input.rooms.commonToilet;
    if (k === 'attachedToilet') return input.attachedToilets.some(Boolean);
    if (k === 'bedroom') return input.bhk > 1;
    return true;
  });
  const setSize = (kind: RoomKind, key: 'defW' | 'defH' | 'minW' | 'minH', ft: number) =>
    setInput({ ...input, roomSizes: { ...input.roomSizes, [kind]: { ...input.roomSizes?.[kind], [key]: ft } } });
  return (
    <View>
      <Title>{t.rooms.title}</Title>
      <Label>{t.rooms.bhk}</Label>
      <ChipGroup
        options={[1, 2, 3, 4].map((n) => ({ value: n as 1 | 2 | 3 | 4, label: `${n}BHK` }))}
        value={input.bhk}
        onChange={(v) => setInput({ ...input, bhk: v })}
      />
      {bedroomNames.map((name, i) => (
        <ToggleRow
          key={name}
          label={`${name}: ${t.rooms.attached}`}
          value={input.attachedToilets[i] ?? false}
          onChange={(v) => {
            const next = [...input.attachedToilets];
            next[i] = v;
            setInput({ ...input, attachedToilets: next });
          }}
        />
      ))}
      <ToggleRow label={t.rooms.elderly} value={input.elderlyGroundBedroom} onChange={(v) => setInput({ ...input, elderlyGroundBedroom: v })} />

      <Label>{t.rooms.toggles}</Label>
      <ToggleRow label={t.rooms.dining} value={input.rooms.dining} onChange={(v) => setInput({ ...input, rooms: { ...input.rooms, dining: v } })} />
      <ToggleRow label={t.rooms.kitchenOpen} value={input.rooms.kitchenOpen} onChange={(v) => setInput({ ...input, rooms: { ...input.rooms, kitchenOpen: v } })} />
      <ToggleRow label={t.rooms.puja} value={input.rooms.puja} onChange={(v) => setInput({ ...input, rooms: { ...input.rooms, puja: v } })} />
      <ToggleRow label={t.rooms.study} value={input.rooms.study} onChange={(v) => setInput({ ...input, rooms: { ...input.rooms, study: v } })} />
      <ToggleRow label={t.rooms.guestBedroom} value={input.rooms.guestBedroom} onChange={(v) => setInput({ ...input, rooms: { ...input.rooms, guestBedroom: v } })} />
      <ToggleRow label={t.rooms.store} value={input.rooms.store} onChange={(v) => setInput({ ...input, rooms: { ...input.rooms, store: v } })} />
      <ToggleRow label={t.rooms.utility} value={input.rooms.utility} onChange={(v) => setInput({ ...input, rooms: { ...input.rooms, utility: v } })} />
      <ToggleRow label={t.rooms.commonToilet} value={input.rooms.commonToilet} onChange={(v) => setInput({ ...input, rooms: { ...input.rooms, commonToilet: v } })} />
      <ToggleRow label={t.rooms.balcony} value={input.rooms.balcony} disabled onChange={() => undefined} />

      <Pressable onPress={() => setShowSizes((s) => !s)} accessibilityRole="button" style={styles.sectionToggle}>
        <Text style={styles.sectionToggleText}>{showSizes ? '▾' : '▸'} {t.rooms.sizes}</Text>
      </Pressable>
      {showSizes ? (
        <View>
          <Hint>{t.rooms.sizesHint}</Hint>
          {activeKinds.map((kind) => {
            const cfg = roomConfig(kind);
            const d = { defW: cfg.defW, defH: cfg.defH, minW: cfg.minW, minH: cfg.minH, ...input.roomSizes?.[kind] };
            return (
              <View key={kind} style={styles.sizeBlock}>
                <Text style={styles.sizeName}>{ROOM_NAMES[kind]}</Text>
                <View style={styles.sizeRow}>
                  <View style={styles.sizeCell}><LengthField label={`${t.rooms.default} W`} valueFt={d.defW} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setSize(kind, 'defW', ft)} /></View>
                  <View style={styles.sizeCell}><LengthField label={`${t.rooms.default} H`} valueFt={d.defH} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setSize(kind, 'defH', ft)} /></View>
                </View>
                <View style={styles.sizeRow}>
                  <View style={styles.sizeCell}><LengthField label={`${t.rooms.minimum} W`} valueFt={d.minW} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setSize(kind, 'minW', ft)} /></View>
                  <View style={styles.sizeCell}><LengthField label={`${t.rooms.minimum} H`} valueFt={d.minH} unit={unit} invalidText={t.errors.badLength} onChange={(ft) => setSize(kind, 'minH', ft)} /></View>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function PrefsStep({ input, setInput }: StepProps) {
  return (
    <View>
      <Title>{t.prefs.title}</Title>
      <Label>{t.prefs.vastu}</Label>
      <ChipGroup
        options={[
          { value: 'strict' as const, label: t.prefs.strict },
          { value: 'moderate' as const, label: t.prefs.moderate },
          { value: 'none' as const, label: t.prefs.none },
        ]}
        value={input.vastu}
        onChange={(v) => setInput({ ...input, vastu: v })}
      />
      <Hint>{t.prefs.strictHint}</Hint>
      {input.vastu === 'strict' ? (
        <>
          <ToggleRow label={t.prefs.zoneFirst} value={input.zoneFirst === true} onChange={(v) => setInput({ ...input, zoneFirst: v })} />
          <Hint>{t.prefs.zoneFirstHint}</Hint>
        </>
      ) : null}
      <Label>{t.prefs.priority}</Label>
      <ChipGroup
        options={[
          { value: 'size' as const, label: t.prefs.size },
          { value: 'openSpace' as const, label: t.prefs.openSpace },
          { value: 'ventilation' as const, label: t.prefs.ventilation },
        ]}
        value={input.priority}
        onChange={(v) => setInput({ ...input, priority: v })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionToggle: { minHeight: 48, justifyContent: 'center', marginTop: space.md },
  sectionToggleText: { fontSize: 17, fontWeight: '700', color: colors.primary },
  sizeBlock: { borderBottomWidth: 1, borderColor: colors.line, paddingVertical: space.sm },
  sizeName: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: space.xs },
  sizeRow: { flexDirection: 'row', gap: space.sm },
  sizeCell: { flex: 1 },
});
