import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { en, type Strings } from './strings';
import { hi } from './strings.hi';

export type Lang = 'en' | 'hi';

const KEY = 'gharplan.lang';
const TABLES: Record<Lang, Strings> = { en, hi };

interface LangValue {
  lang: Lang;
  t: Strings;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangValue>({ lang: 'en', t: en, setLang: () => undefined });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    // Storage can fail; English is the default either way.
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'en' || v === 'hi') setLangState(v);
      })
      .catch(() => undefined);
  }, []);

  const value = useMemo<LangValue>(
    () => ({
      lang,
      t: TABLES[lang],
      setLang: (l) => {
        setLangState(l);
        AsyncStorage.setItem(KEY, l).catch(() => undefined);
      },
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The strings for the current language. Use inside components. */
export function useT(): Strings {
  return useContext(Ctx).t;
}

export function useLanguage(): { lang: Lang; setLang: (l: Lang) => void } {
  const { lang, setLang } = useContext(Ctx);
  return { lang, setLang };
}
