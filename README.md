<div align="center">
  <img src="./assets/images/logo.png" width="120" alt="GymApp" />
  <h1>GymApp</h1>
  <p><strong>Registro de rutinas de gimnasio · 100% local · sin conexión</strong></p>
</div>

GymApp es una aplicación móvil para registrar entrenamientos de fuerza: creas tus
días (Pecho, Espalda, Pierna…), los ejecutas serie a serie con un cronómetro
basado en marcas de tiempo, y consultas tu progreso de 1RM y tu calendario de
entrenamientos. **Todos los datos se guardan únicamente en el dispositivo**
(SQLite); no hay servidor ni cuenta de usuario.

---

## ✨ Características

| Pantalla | Qué hace |
|----------|----------|
| **Entreno (Inicio)** | Lista de tus días de entrenamiento. Botón para crear/editar días eligiendo ejercicios del catálogo. Al empezar, esta misma pestaña pasa a ser la sesión activa. |
| **Sesión activa** | Bloques de ejercicio con **peso global por ejercicio**, registro de **series inline** (tick verde) y **cálculo del descanso** respecto a la serie anterior. El ejercicio activo se resalta en verde; puedes **cambiar el orden libremente**, **posponer** un ejercicio empezado y añadir **ejercicios adicionales**. Al terminar un bloque, las series se **colapsan** (`12-12-12-10`). Controles globales **Guardar** (pausar) y **Fin**. |
| **Calendario** | Vista mensual a pantalla completa con marcadores del tipo de día entrenado, swipe animado entre meses y selector rápido de mes/año. Drill-down: día → tipo de día → ejercicios → histórico. |
| **Histórico** | Drill-down día → ejercicio → gráfico de **1RM promedio** (eje X equiespaciado) y lista de registros con peso, repeticiones y descansos. |
| **Ajustes** | Catálogo de ejercicios (con flag **corporal**), peso del usuario, **copias de seguridad** (exportar/importar `.json`) y notas de desarrollo. |

### Reglas de negocio destacadas

- **Peso global, no por serie.** El peso se anota una vez por ejercicio y sesión.
- **Cronómetro por timestamps.** No hay temporizador en segundo plano: cada serie
  guarda su hora exacta y el descanso se calcula como la diferencia con la serie
  inmediatamente anterior (la 1.ª no tiene descanso).
- **Ejercicios corporales.** Si un ejercicio es corporal (p. ej. Dominadas), el
  1RM usa `peso_usuario + lastre`. El peso del usuario se guarda como _snapshot_
  en cada sesión para que el histórico no cambie si luego lo modificas.
- **Una sesión a la vez.** Mientras haya un entrenamiento activo o en pausa, la
  pestaña Entreno muestra la sesión (no se puede iniciar otro día).

### Fórmulas

```
1RM (Epley) = Peso × (1 + Repeticiones / 30)
1RM del día = media del 1RM de todas las series de ese día
```

---

## 🧱 Stack técnico

- **Expo SDK 54** · React Native 0.81 · React 19 · TypeScript (modo estricto)
- **Expo Router 6** (navegación basada en archivos, rutas tipadas)
- **expo-sqlite** (base de datos local)
- **react-native-svg** (gráfico de 1RM)
- **react-native-reanimated** + **react-native-gesture-handler** (animaciones/gestos del calendario)
- **expo-file-system / expo-document-picker / expo-sharing** (copias de seguridad)

---

## 📂 Estructura del proyecto

```
app/                      Rutas (Expo Router)
  (tabs)/                 Pestañas inferiores
    index.tsx             Pestaña "Entreno": muestra Inicio o Sesión según haya entrenamiento
    calendario.tsx        Calendario mensual
    historico.tsx         Histórico (drill-down de días)
    ajustes.tsx           Ajustes
  day-form.tsx            Crear / editar un día (modal)
  exercise/[id].tsx       Detalle de un ejercicio (gráfico + registros)
  day-detail/[date].tsx   Detalle de una jornada del calendario
  _layout.tsx             Layout raíz: SQLiteProvider + tema + Stack

components/gym/           UI de la app
  home-view.tsx           Contenido del Inicio
  session-view.tsx        Contenido de la sesión activa
  exercise-block.tsx      Bloque de ejercicio (series, peso, cronómetro)
  line-chart.tsx          Gráfico de líneas (SVG)
  ui.tsx                  Kit base (Screen, Button, Card, EmptyState…)

db/                       Capa de datos (modular)
  schema.ts               DDL de las tablas + init (Paso 1)
  types.ts                Tipos del dominio
  settings.ts / exercises.ts / days.ts / sessions.ts
  history.ts / calendar.ts / notes.ts / backup.ts

lib/                      Utilidades (cálculos 1RM, formato, E/S de backups)
context/                  SessionProvider (estado de la sesión activa)
constants/gym-theme.ts    Paleta y tokens de diseño
reference/                Material de referencia (NO se compila)
```

---

## 🗄️ Modelo de datos (SQLite)

| Tabla | Descripción |
|-------|-------------|
| `exercises` | Catálogo global. Incluye `es_corporal`. |
| `days` / `day_exercises` | Plantillas de día y sus ejercicios (ordenados). |
| `sessions` | Sesión real: `start_ts`, `end_ts`, `user_weight` (snapshot), `status`. |
| `session_exercises` | Bloque de ejercicio de una sesión. **`weight` = peso global.** |
| `sets` | Series: `reps`, `ts` y `rest_seconds` (descanso calculado). |
| `settings` | Clave-valor (incluye `user_weight`). |
| `dev_notes` | Notas de desarrollo. **Se excluye de las copias de seguridad.** |

El esquema completo y comentado está en [`db/schema.ts`](./db/schema.ts).

---

## 🚀 Ejecutar en desarrollo (Expo Go)

Requisitos: Node 18+ y la app **Expo Go** en tu móvil (Android/iOS).

```bash
npm install      # solo la primera vez
npx expo start
```

Escanea el QR con Expo Go. Todas las dependencias nativas usadas (SQLite, SVG,
file-system, document-picker, sharing) están incluidas en Expo Go para SDK 54,
así que **no necesitas una build nativa para probar**.

> **Primer arranque** (la base de datos empieza vacía):
> 1. **Ajustes** → escribe tu peso y crea algunos ejercicios (marca *corporal* en p. ej. Dominadas).
> 2. **Ajustes → Nuevo día** (o el botón *Nuevo día* del Inicio) → nombra el día y selecciona ejercicios.
> 3. **Entreno** → *Empezar* → confirma el peso, registra series con el tick ✓, *Terminado*, *Fin*.
> 4. Mira **Histórico** y **Calendario**.

Comprobaciones de calidad:

```bash
npx tsc --noEmit   # tipos
npx expo lint      # linter
```

---

## 💾 Copias de seguridad

Desde **Ajustes → Copias de seguridad**:

- **Exportar:** genera un `gymapp-backup-AAAA-MM-DD-HH-MM-SS.json` con toda la base
  de datos (catálogo, días, sesiones e histórico) y abre el diálogo de compartir.
- **Importar:** elige un `.json` y **sobrescribe** los datos actuales. Las *Notas de
  desarrollo* nunca se incluyen ni se ven afectadas. Todo se restaura dentro de una
  transacción (si falla, la base de datos no se corrompe).

---

## 📦 Compilar el APK de Android

Las instrucciones detalladas están en **[`docs/COMPILAR-APK.md`](./docs/COMPILAR-APK.md)**.
Resumen rápido con **EAS Build** (recomendado, compila en la nube):

```bash
npm install -g eas-cli      # o usa: npx eas-cli@latest <comando>
eas login                   # cuenta gratuita de expo.dev
eas init                    # vincula el proyecto (crea el projectId)
eas build -p android --profile preview
```

Al terminar, EAS te da un enlace para **descargar el `.apk`** e instalarlo en
cualquier Android. El perfil `preview` ya está configurado en
[`eas.json`](./eas.json) para producir **APK** (no AAB).

---

## 📝 Notas

- El icono de la app (`assets/images/AppIcon.png`) se procesó para **quitar el
  fondo blanco**; los assets derivados (`logo.png`, `app-icon.png`,
  `splash-logo.png`) se generan con [`scripts/process-icon.ps1`](./scripts/process-icon.ps1).
- La carpeta `reference/` contiene material de apoyo y está **excluida** de la
  compilación (`tsconfig.json`).
