// Configuración de Metro.
// Necesaria para que `expo-sqlite` funcione en la plataforma web: carga un
// módulo WebAssembly (wa-sqlite.wasm) y requiere SharedArrayBuffer, que a su vez
// exige las cabeceras COOP/COEP. En nativo (Expo Go / APK) no se usa wasm, pero
// tener esta config evita que el bundler web falle al resolver el .wasm.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Permite resolver/empaquetar archivos .wasm como assets.
config.resolver.assetExts.push('wasm');

// Cabeceras necesarias para habilitar SharedArrayBuffer en el servidor de dev web.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    middleware(req, res, next);
  };
};

module.exports = config;
