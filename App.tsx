import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ACCEPTANCE_CASES, defaultInput, generatePlans, type GenerationResult, type PlotInput, type Unit } from './engine';
import { useT, useLanguage, LanguageProvider } from './ui/i18n';
import { colors, space, touch } from './ui/theme';
import { Button, Card, Hint, ProgressBar, Title } from './ui/components';
import { BuildingStep, PlotStep, PrefsStep, RoomsStep } from './ui/wizard';
import { ResultsView, GeneratingView } from './ui/Results';
import { ViewerScreen } from './ui/Viewer';
import { loadPlans, savePlans, type SavedPlan } from './ui/storage';

type Screen = 'welcome' | 'wizard' | 'generating' | 'results' | 'viewer';
const STEP_COUNT = 4;
const RESTARTS = 600;

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}

function AppInner() {
  const t = useT();
  const { lang, setLang } = useLanguage();
  const [screen, setScreen] = useState<Screen>('welcome');
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<PlotInput>(defaultInput());
  const [unit, setUnit] = useState<Unit>('ftin');
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [saved, setSaved] = useState<SavedPlan[]>([]);
  const [savedFlag, setSavedFlag] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    loadPlans().then(setSaved);
  }, []);

  const generate = (from: PlotInput) => {
    setInput(from);
    setSavedFlag(false);
    setGeneration((g) => g + 1);
    setScreen('generating');
    // Yield once so the loading screen paints before the search starts.
    setTimeout(() => {
      setResult(generatePlans(from, { count: 3, restarts: RESTARTS }));
      setScreen('results');
    }, 50);
  };

  const storePlan = async () => {
    const plan: SavedPlan = {
      id: String(Date.now()),
      name: `${input.width}x${input.depth} ${input.facing} ${input.bhk}BHK`,
      savedAt: new Date().toISOString(),
      input,
    };
    const next = [plan, ...saved].slice(0, 20);
    setSaved(next);
    await savePlans(next);
    setSavedFlag(true);
  };

  const deletePlan = async (id: string) => {
    const next = saved.filter((p) => p.id !== id);
    setSaved(next);
    await savePlans(next);
  };

  const next = () => {
    if (step < STEP_COUNT - 1) setStep(step + 1);
    else generate(input);
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
    else setScreen('welcome');
  };

  let body: React.ReactNode;
  if (screen === 'welcome') {
    body = (
      <ScrollView contentContainerStyle={styles.pad}>
        <Pressable
          onPress={() => setLang(lang === 'en' ? 'hi' : 'en')}
          accessibilityRole="button"
          style={styles.langBtn}
        >
          <Text style={styles.langText}>{t.switchLanguage}</Text>
        </Pressable>
        <Text style={styles.appName}>{t.appName}</Text>
        <Text style={styles.tagline}>{t.tagline}</Text>
        <Hint>{t.intro}</Hint>
        <Button label={t.startNew} onPress={() => { setInput(defaultInput()); setStep(0); setScreen('wizard'); }} />
        <Title>{t.savedPlans}</Title>
        {saved.length === 0 ? <Hint>{t.noSavedPlans}</Hint> : null}
        {saved.map((p) => (
          <Card key={p.id}>
            <Text style={styles.planName}>{p.name}</Text>
            <Text style={styles.planDate}>{new Date(p.savedAt).toLocaleDateString()}</Text>
            <Button label={t.open} onPress={() => generate(p.input)} />
            <Button label={t.delete} kind="ghost" onPress={() => deletePlan(p.id)} />
          </Card>
        ))}
        <Hint>{t.samplePlots}</Hint>
        {ACCEPTANCE_CASES.map((c) => (
          <Button key={c.name} label={c.name} kind="ghost" onPress={() => generate(c.input)} />
        ))}
      </ScrollView>
    );
  } else if (screen === 'wizard') {
    const props = { input, setInput, unit };
    const stepBody = [<PlotStep key="p" {...props} />, <BuildingStep key="b" {...props} />, <RoomsStep key="r" {...props} />, <PrefsStep key="v" {...props} />][step];
    const isLast = step === STEP_COUNT - 1;
    body = (
      <View style={styles.flex}>
        <View style={styles.wizardTop}>
          <Text style={styles.stepLabel}>{t.stepLabel(step + 1, STEP_COUNT)} · {Object.values(t.steps)[step]}</Text>
          <ProgressBar fraction={(step + 1) / STEP_COUNT} />
          <UnitToggle unit={unit} onChange={setUnit} />
        </View>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">{stepBody}</ScrollView>
        <View style={styles.footer}>
          <Button label={t.back} kind="ghost" onPress={back} />
          <Button label={isLast ? t.generate : t.next} onPress={next} />
        </View>
      </View>
    );
  } else if (screen === 'generating') {
    body = (
      <View style={styles.flex}>
        <GeneratingView />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  } else if (screen === 'results' && result) {
    body = (
      <ResultsView
        result={result}
        unit={unit}
        saved={savedFlag}
        onView={(i) => { setViewIndex(i); setScreen('viewer'); }}
        onSave={storePlan}
        onEdit={() => { setStep(0); setScreen('wizard'); }}
      />
    );
  } else if (screen === 'viewer' && result && result.layouts[viewIndex]) {
    body = (
      <View style={styles.flex}>
        <View style={styles.viewerTop}>
          <Pressable onPress={() => setScreen('results')} accessibilityRole="button" style={styles.backBtn}>
            <Text style={styles.backText}>‹ {t.back}</Text>
          </Pressable>
          <Text style={styles.viewerTitle}>{t.results.layout(result.layouts[viewIndex].id.replace('L', ''))}</Text>
        </View>
        <ViewerScreen key={`${generation}-${viewIndex}`} layout={result.layouts[viewIndex]} input={input} unit={unit} onUnit={setUnit} />
      </View>
    );
  } else {
    body = <Hint>{t.results.none}</Hint>;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {body}
    </SafeAreaView>
  );
}

function UnitToggle({ unit, onChange, compact }: { unit: Unit; onChange: (u: Unit) => void; compact?: boolean }) {
  const t = useT();
  const label = unit === 'ftin' ? 'ft-in' : 'm';
  return (
    <Pressable
      onPress={() => onChange(unit === 'ftin' ? 'm' : 'ftin')}
      accessibilityRole="button"
      accessibilityLabel={t.a11y.units(label)}
      style={[styles.unitBtn, compact && { minHeight: 36 }]}
    >
      <Text style={styles.unitText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { padding: space.md, paddingBottom: space.lg * 2 },
  langBtn: { alignSelf: 'flex-end', minHeight: touch, justifyContent: 'center', paddingHorizontal: space.md },
  langText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  appName: { fontSize: 32, fontWeight: '800', color: colors.primary, marginTop: space.md },
  tagline: { fontSize: 18, color: colors.ink, marginBottom: space.sm },
  planName: { fontSize: 17, fontWeight: '700', color: colors.ink },
  planDate: { fontSize: 13, color: colors.muted, marginBottom: space.sm },
  wizardTop: { paddingHorizontal: space.md, paddingTop: space.sm },
  stepLabel: { fontSize: 14, color: colors.muted, marginBottom: space.xs },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  unitBtn: { alignSelf: 'flex-end', minHeight: touch - 8, minWidth: touch, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.line, paddingHorizontal: space.sm },
  unitText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  viewerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.sm, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.line },
  backBtn: { minHeight: touch, justifyContent: 'center' },
  backText: { fontSize: 17, color: colors.primary, fontWeight: '600' },
  viewerTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
});
