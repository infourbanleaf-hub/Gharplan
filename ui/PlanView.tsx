import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import type { Layout } from '../engine';
import { planScene, type Item, type PlanOptions } from '../render';
import type { View as RNView } from 'react-native';

interface Props {
  layout: Layout;
  options: Partial<PlanOptions>;
  resetKey: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

/**
 * Draws the plan scene with react-native-svg. Pinch zooms and one-finger drag pans.
 * The viewBox is the window onto the drawing, so zoom and pan never redraw the scene.
 */
export const PlanView = forwardRef<RNView, Props>(function PlanView({ layout, options, resetKey }, ref) {
  const wrap = useRef<View>(null);
  useImperativeHandle(ref, () => wrap.current as unknown as RNView);
  const scene = useMemo(() => planScene(layout, options), [layout, options]);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState({ x: scene.width / 2, y: scene.height / 2 });
  const gesture = useRef({ zoom: 1, centre: { x: 0, y: 0 }, dist: 0, startX: 0, startY: 0, startCentre: { x: 0, y: 0 }, pinching: false });

  // Reset the view when the layout changes or the user asks for it
  useEffect(() => {
    gesture.current = { ...gesture.current, zoom: 1, centre: { x: scene.width / 2, y: scene.height / 2 } };
    setZoom(1);
    setCentre({ x: scene.width / 2, y: scene.height / 2 });
  }, [scene, resetKey]);

  const clampCentre = (c: { x: number; y: number }, z: number) => {
    const vw = scene.width / z;
    const vh = scene.height / z;
    return {
      x: Math.min(Math.max(c.x, vw / 2), scene.width - vw / 2),
      y: Math.min(Math.max(c.y, vh / 2), scene.height - vh / 2),
    };
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt, g) => {
          const touches = evt.nativeEvent.touches;
          gesture.current.startX = g.x0;
          gesture.current.startY = g.y0;
          gesture.current.startCentre = gesture.current.centre;
          gesture.current.dist = touches.length >= 2 ? distance(touches) : 0;
          gesture.current.pinching = touches.length >= 2;
          gesture.current.zoom = gesture.current.zoom || 1;
        },
        onPanResponderMove: (evt, g) => {
          const g2 = gesture.current;
          const touches = evt.nativeEvent.touches;
          const z0 = g2.zoom;
          let z = z0;
          if (touches.length >= 2) {
            const d = distance(touches);
            if (g2.dist > 0) z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z0 * (d / g2.dist)));
            g2.dist = d;
          }
          // Screen pixels to drawing units at the current zoom
          const unitsPerPx = (scene.width / z) / Math.max(1, size.w);
          const base = g2.pinching ? g2.centre : clampCentre({
            x: g2.startCentre.x - (g.dx) * unitsPerPx,
            y: g2.startCentre.y - (g.dy) * unitsPerPx,
          }, z0);
          const next = clampCentre(base, z);
          g2.zoom = z;
          g2.centre = next;
          setZoom(z);
          setCentre(next);
        },
        onPanResponderRelease: () => {
          gesture.current.pinching = false;
          gesture.current.startCentre = gesture.current.centre;
        },
      }),
    [scene, size.w],
  );

  const vw = scene.width / zoom;
  const vh = scene.height / zoom;
  const viewBox = `${centre.x - vw / 2} ${centre.y - vh / 2} ${vw} ${vh}`;

  return (
    <View
      ref={wrap}
      style={styles.wrap}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...responder.panHandlers}
    >
      <Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        {scene.items.map((it, i) => renderItem(it, i))}
      </Svg>
    </View>
  );
});

function distance(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function renderItem(it: Item, key: number) {
  switch (it.kind) {
    case 'polygon':
      return (
        <Polygon
          key={key}
          points={it.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={it.fill}
          stroke={it.stroke}
          strokeWidth={it.strokeWidth}
          strokeDasharray={it.dash ? it.dash.split(' ').map(Number) : undefined}
        />
      );
    case 'polyline':
      return (
        <Polyline
          key={key}
          points={it.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={it.stroke}
          strokeWidth={it.strokeWidth}
          strokeDasharray={it.dash ? it.dash.split(' ').map(Number) : undefined}
          strokeLinecap="round"
        />
      );
    case 'text':
      return (
        <SvgText
          key={key}
          x={it.x}
          y={it.y}
          fontSize={it.size}
          fill={it.fill}
          textAnchor={it.anchor}
          fontWeight={it.weight === 'bold' ? '700' : '400'}
        >
          {it.text}
        </SvgText>
      );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#ffffff', minHeight: 320 },
});
