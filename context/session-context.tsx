import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getActiveSession } from '@/db/sessions';

interface SessionContextValue {
  /** Id de la sesión activa o pausada, o null si no hay ninguna. */
  activeSessionId: number | null;
  loading: boolean;
  /** Relee el estado desde la BD (llamar tras iniciar/terminar una sesión). */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const s = await getActiveSession(db);
    setActiveSessionId(s ? s.id : null);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ activeSessionId, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>');
  return ctx;
}
