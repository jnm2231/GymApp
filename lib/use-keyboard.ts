import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Altura actual del teclado en pantalla (0 si está oculto).
 *
 * Se usa para añadir relleno inferior a los ScrollView y poder desplazar los
 * inputs por encima del teclado. En Android con edge-to-edge el modo
 * `adjustResize` no siempre reduce la ventana, así que gestionamos el espacio
 * manualmente desde JS (funciona también en Expo Go).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
