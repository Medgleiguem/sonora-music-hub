import { registerPlugin } from '@capacitor/core';
import { createNativePlayerClient } from './native-player-core.mjs';

export const nativePlayer = createNativePlayerClient(registerPlugin('SonoraPlayer'));
