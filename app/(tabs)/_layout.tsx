import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { GymTheme } from '@/constants/gym-theme';
import { useSession } from '@/context/session-context';

/** Icono de pesa con un "+" superpuesto para la pestaña de entrenamiento. */
function DumbbellPlus({ color, size }: { color: string; size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <MaterialCommunityIcons name="dumbbell" size={size} color={color} />
      <View
        style={{
          position: 'absolute',
          top: -3,
          right: -5,
          backgroundColor: GymTheme.background,
          borderRadius: 999,
        }}>
        <MaterialCommunityIcons name="plus-circle" size={size * 0.5} color={color} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { activeSessionId } = useSession();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GymTheme.primary,
        tabBarInactiveTintColor: GymTheme.textFaint,
        tabBarStyle: {
          backgroundColor: GymTheme.surface,
          borderTopColor: GymTheme.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Entreno',
          tabBarIcon: ({ color, size }) => <DumbbellPlus color={color} size={size} />,
        }}
        listeners={{
          tabPress: (e) => {
            // Si hay una sesión activa, el icono de pesa vuelve a ella.
            if (activeSessionId) {
              e.preventDefault();
              router.push('/session');
            }
          },
        }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: 'Calendario',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-month" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-line" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-sharp" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
