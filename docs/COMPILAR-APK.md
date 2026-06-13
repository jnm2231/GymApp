# Compilar el APK de GymApp

Esta guía explica cómo generar el archivo `.apk` instalable de GymApp. La forma
recomendada es **EAS Build** (compila en los servidores de Expo, no necesitas
Android Studio). Al final hay una alternativa para compilar **en local**.

---

## 0. Qué ya está configurado

- **`app.json`** → `android.package` (`com.jnm2231.gymapp`) y `android.versionCode`.
  Son obligatorios para cualquier build nativa.
- **`eas.json`** → tres perfiles de build. Todos producen **APK** (no AAB):

  | Perfil | Uso | Salida |
  |--------|-----|--------|
  | `development` | Build de desarrollo con dev-client | APK depurable |
  | `preview` | **El que usarás normalmente** para probar/instalar | APK release, distribución interna |
  | `production` | Versión final, con `versionCode` autoincremental | APK release |

  `cli.appVersionSource` está en `"local"`: la versión sale de `app.json`
  (`version` y `android.versionCode`).

---

## 1. Requisitos

1. Una cuenta gratuita en **[expo.dev](https://expo.dev)**.
2. **EAS CLI**. Puedes instalarlo global:
   ```bash
   npm install -g eas-cli
   ```
   …o usarlo sin instalar anteponiendo `npx`:
   ```bash
   npx eas-cli@latest <comando>
   ```

---

## 2. Compilar con EAS Build (en la nube)

```bash
# 1) Inicia sesión con tu cuenta de Expo
eas login

# 2) Vincula el proyecto (crea el projectId en app.json → extra.eas.projectId)
eas init

# 3) Lanza la build del APK
eas build -p android --profile preview
```

Durante la primera build:

- Cuando pregunte por las **credenciales de firma (keystore)**, elige
  **«Generate new keystore»** y deja que **EAS lo gestione por ti**. Quedará
  guardado en tu cuenta para futuras builds (no lo pierdas: es lo que identifica
  tu app al actualizarla).
- La compilación tarda unos minutos. Al terminar te dará:
  - un **enlace** para descargar el `.apk`, y
  - un **QR** que puedes escanear desde el móvil para descargarlo directamente.

Para ver builds anteriores y sus enlaces:

```bash
eas build:list
```

---

## 3. Instalar el APK en el móvil

- **Opción A (sencilla):** abre el enlace/QR de la build en el móvil, descarga el
  `.apk` y ábrelo. Android pedirá permitir «instalar apps de orígenes
  desconocidos» la primera vez.
- **Opción B (con cable, vía adb):**
  ```bash
  adb install ruta/al/gymapp.apk
  ```
- **Opción C (emulador):** instala automáticamente la última build con:
  ```bash
  eas build:run -p android
  ```

---

## 4. Publicar nuevas versiones

Cada APK necesita un `versionCode` mayor que el anterior:

- Con el perfil **`production`** (`autoIncrement: true`) EAS lo sube solo.
- Con **`preview`**, súbelo a mano en `app.json` (`android.versionCode`) y, si
  cambia la versión visible, también `expo.version` (p. ej. `1.0.1`).

```bash
eas build -p android --profile production
```

---

## 5. Alternativa: compilar en local (avanzado)

Solo si **no** quieres usar la nube de EAS. Necesitas **JDK 17** y el **Android
SDK** instalados y configurados (`ANDROID_HOME`).

```bash
# Genera el proyecto nativo android/ a partir de la config de Expo
npx expo prebuild --platform android

# APK de prueba (firmado con la debug key, se instala directamente)
cd android
./gradlew assembleDebug
# Windows PowerShell:  .\gradlew assembleDebug
```

El APK queda en:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Para un APK **release** firmado necesitas crear un keystore propio y configurar
`android/app/build.gradle` (`signingConfigs`). Para uso personal, el
`assembleDebug` anterior es suficiente para instalar y probar.

> Nota: la carpeta `android/` generada por `prebuild` es desechable; puedes
> borrarla y volver a generarla. No hace falta versionarla si usas EAS.

---

## 6. Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| `Invalid package name` | Revisa `android.package` en `app.json` (formato `com.algo.app`). |
| La build falla al resolver dependencias nativas | Asegúrate de instalar siempre con `npx expo install <paquete>` para versiones compatibles con SDK 54. |
| «App no instalada» en el móvil | Desinstala una versión previa o sube el `versionCode`. |
| Pide credenciales y no sabes qué elegir | Deja que **EAS gestione el keystore** (opción por defecto). |
