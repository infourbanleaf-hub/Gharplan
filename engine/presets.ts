import type { PlotInput } from './types';

/** Starting point for the wizard: every field has a sensible default. */
export function defaultInput(): PlotInput {
  return {
    width: 30,
    depth: 40,
    facing: 'N',
    roadSide: 'front',
    cornerSide: 'right',
    openSpacePct: 5,
    floors: 1,
    parking: { cars: 0, twoWheelers: 0 },
    staircase: 'internal',
    bhk: 2,
    attachedToilets: [true, false, false, false],
    rooms: {
      dining: true,
      kitchenOpen: false,
      puja: false,
      study: false,
      guestBedroom: false,
      store: false,
      utility: false,
      balcony: false,
      commonToilet: true,
    },
    elderlyGroundBedroom: false,
    vastu: 'moderate',
    priority: 'size',
  };
}

/** The four acceptance cases from the brief (Section 11). */
export const ACCEPTANCE_CASES: { name: string; input: PlotInput }[] = [
  {
    name: '1. 30x40 east, 2BHK, Vastu moderate, 1 car',
    input: {
      ...defaultInput(),
      width: 30, depth: 40, facing: 'E', bhk: 2,
      vastu: 'moderate', parking: { cars: 1, twoWheelers: 0 },
    },
  },
  {
    name: '2. 30x50 north, 3BHK, puja, elderly ground-floor bedroom',
    input: {
      ...defaultInput(),
      width: 30, depth: 50, facing: 'N', bhk: 3,
      attachedToilets: [true, false, false, false],
      rooms: { ...defaultInput().rooms, puja: true },
      elderlyGroundBedroom: true, vastu: 'moderate',
    },
  },
  {
    name: '3. 20x45 west, 2BHK, no Vastu, 2 two-wheelers',
    input: {
      ...defaultInput(),
      width: 20, depth: 45, facing: 'W', bhk: 2,
      vastu: 'none', parking: { cars: 0, twoWheelers: 2 },
    },
  },
  {
    name: '4. 40x60 corner south, 4BHK + study + guest, strict Vastu',
    input: {
      ...defaultInput(),
      width: 40, depth: 60, facing: 'S', roadSide: 'corner', cornerSide: 'right',
      bhk: 4, attachedToilets: [true, false, false, false],
      rooms: { ...defaultInput().rooms, study: true, guestBedroom: true },
      vastu: 'strict', parking: { cars: 1, twoWheelers: 2 },
    },
  },
];
