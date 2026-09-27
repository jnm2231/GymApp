import { HomeView } from '@/components/gym/home-view';
import { SessionView } from '@/components/gym/session-view';
import { Loading } from '@/components/gym/ui';
import { useSession } from '@/context/session-context';
import Animated, { FadeIn } from 'react-native-reanimated';

/**
 * Pestaña "Entreno". Si hay un entrenamiento activo (o en pausa) muestra la
 * sesión; si no, muestra la Pantalla Inicial. De este modo no se puede acceder
 * al Inicio mientras hay un entrenamiento en curso.
 */
export default function EntrenoTab() {
  const { activeSessionId, loading } = useSession();

  if (loading) return <Loading />;
  return (
    <Animated.View key={activeSessionId == null ? 'home' : 'session'} entering={FadeIn.duration(180)} style={{ flex: 1 }}>
      {activeSessionId != null ? <SessionView /> : <HomeView />}
    </Animated.View>
  );
}
