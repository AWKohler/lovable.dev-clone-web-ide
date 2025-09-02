export function getExpoTemplate(projectId: string) {
  const slug = projectId.slice(0, 20).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return {
    'package.json': { file: { contents: JSON.stringify({
      name: projectId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      private: true,
      version: '1.0.0',
      main: 'expo-router/entry',
      scripts: {
        dev: 'EXPO_NO_TELEMETRY=1 expo start',
        'build:web': 'expo export --platform web',
        lint: 'expo lint'
      },
      dependencies: {
        '@expo/vector-icons': '^14.1.0',
        '@lucide/lab': '^0.1.2',
        '@react-navigation/bottom-tabs': '^7.2.0',
        '@react-navigation/native': '^7.0.14',
        expo: '^53.0.0',
        'expo-blur': '~14.1.3',
        'expo-camera': '~16.1.5',
        'expo-constants': '~17.1.3',
        'expo-font': '~13.2.2',
        'expo-haptics': '~14.1.3',
        'expo-linear-gradient': '~14.1.3',
        'expo-linking': '~7.1.3',
        'expo-router': '~5.0.2',
        'expo-splash-screen': '~0.30.6',
        'expo-status-bar': '~2.2.2',
        'expo-symbols': '~0.4.3',
        'expo-system-ui': '~5.0.5',
        'expo-web-browser': '~14.1.5',
        'lucide-react-native': '^0.475.0',
        react: '19.0.0',
        'react-dom': '19.0.0',
        'react-native': '0.79.1',
        'react-native-gesture-handler': '~2.24.0',
        'react-native-reanimated': '~3.17.4',
        'react-native-safe-area-context': '5.3.0',
        'react-native-screens': '~4.10.0',
        'react-native-svg': '15.11.2',
        'react-native-url-polyfill': '^2.0.0',
        'react-native-web': '^0.20.0',
        'react-native-webview': '13.13.5'
      },
      devDependencies: {
        '@babel/core': '^7.25.2',
        '@types/react': '~19.0.10',
        typescript: '~5.8.3'
      }
    }, null, 2) }},
    'app.json': { file: { contents: JSON.stringify({ expo: { name: 'Huggable Mobile', slug } }, null, 2) }},
    'tsconfig.json': { file: { contents: JSON.stringify({ compilerOptions: { jsx: 'react-jsx', strict: true } }, null, 2) }},
    'app/_layout.tsx': { file: { contents: `import { Stack } from 'expo-router';
export default function RootLayout(){ return <Stack screenOptions={{ headerShown:false }} /> }` }},
    'app/index.tsx': { file: { contents: `import { View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
export default function Page(){ return (<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Text>Welcome to Huggable (Expo)</Text><StatusBar style="auto" /></View>); }` }},
  } as const;
}

