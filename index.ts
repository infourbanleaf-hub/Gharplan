import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

// On the web build, let the app fill the whole phone-sized viewport.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  for (const el of [document.documentElement, document.body]) {
    el.style.margin = '0';
    el.style.height = '100%';
    el.style.width = '100%';
  }
  const root = document.getElementById('root');
  if (root) {
    root.style.height = '100%';
    root.style.width = '100%';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
  }
}

registerRootComponent(App);
