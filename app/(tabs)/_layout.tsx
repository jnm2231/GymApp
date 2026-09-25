import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { GymTheme } from '@/constants/gym-theme';

function TrainingAction({ focused }: { focused: boolean }) {
  return (
    <View style={styles.trainingAction}>
      <View style={[styles.trainingCircle, focused && styles.trainingCircleFocused]}>
        <MaterialCommunityIcons name="dumbbell" size={27} color="#160B00" />
      </View>
      <Text style={[styles.trainingLabel, focused && styles.trainingLabelFocused]}>Entrenar</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GymTheme.primary,
        tabBarInactiveTintColor: GymTheme.textFaint,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
      }}>
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
        name="index"
        options={{
          title: 'Entrenar',
          tabBarLabel: () => null,
          tabBarItemStyle: styles.trainingItem,
          tabBarIcon: ({ focused }) => <TrainingAction focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="personal"
        options={{
          title: 'Personal',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-heart" size={size} color={color} />
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

const styles = StyleSheet.create({
  bar: {
    height: Platform.OS === 'ios' ? 82 : 70,
    paddingTop: 7,
    paddingBottom: Platform.OS === 'ios' ? 18 : 7,
    backgroundColor: GymTheme.surface,
    borderTopColor: GymTheme.border,
    overflow: 'visible',
  },
  label: { fontSize: 10, fontWeight: '700' },
  trainingItem: { overflow: 'visible' },
  trainingAction: {
    width: 76,
    alignItems: 'center',
    transform: [{ translateY: -14 }],
  },
  trainingCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GymTheme.primary,
    borderWidth: 5,
    borderColor: GymTheme.background,
    shadowColor: GymTheme.primary,
    shadowOpacity: 0.38,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 9,
  },
  trainingCircleFocused: { borderColor: GymTheme.text },
  trainingLabel: {
    color: GymTheme.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
  },
  trainingLabelFocused: { color: GymTheme.primary },
});
