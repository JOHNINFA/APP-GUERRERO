# 📱 Guía de Instalación - App Guerrero

## Requisitos Previos

- **Node.js** v20.x o superior
- **npm** v10.x o superior  
- **Expo CLI**: Se instala automáticamente con npx
- **Dispositivo móvil** con la app "Expo Go" instalada (desde Play Store o App Store)

---

## 🚀 Instalación Rápida

### Paso 1: Navegar a la carpeta de la app
```bash
cd "AP GUERRERO"
```

### Paso 2: Instalar todas las dependencias
```bash
npm install
```

### Paso 3: Iniciar la aplicación
```bash
npx expo start
```

### Paso 4: Escanear el código QR con Expo Go en tu celular

---

## ⚙️ Configuración Importante

### Cambiar IP del Servidor

Edita el archivo `config.js` y cambia la IP por la del PC donde corre Django:

```javascript
// config.js
export const API_URL = 'http://192.168.X.X:8000';  // ← Cambiar por IP real
```

**Para obtener la IP del servidor:**
```bash
# Linux/Mac:
ip addr show | grep "inet 192"

# Windows:
ipconfig
```

---

## 📦 Paquetes Instalados

Si por alguna razón necesitas instalar paquetes manualmente:

### Paquetes de Expo (usar npx expo install)
```bash
npx expo install expo-camera expo-image-picker expo-print expo-sharing expo-file-system expo-linear-gradient expo-checkbox expo-status-bar expo-background-fetch expo-task-manager @react-native-community/datetimepicker
```

### Paquetes de Navegación
```bash
npm install @react-navigation/native @react-navigation/stack react-native-screens react-native-safe-area-context react-native-gesture-handler
```

### Almacenamiento y Red
```bash
npm install @react-native-async-storage/async-storage @react-native-community/netinfo
```

### Firebase (opcional)
```bash
npm install @react-native-firebase/app @react-native-firebase/database firebase
```

### UI y Otros
```bash
npm install react-native-elements react-native-vector-icons react-native-svg
```

---

## 📋 Lista Completa de Dependencias

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `expo` | ^54.0.18 | Framework base |
| `expo-camera` | ~17.0.9 | Acceso a cámara |
| `expo-image-picker` | ~17.0.8 | Seleccionar/tomar fotos |
| `expo-print` | ~15.0.7 | Generar PDFs |
| `expo-sharing` | ~14.0.7 | Compartir archivos |
| `expo-file-system` | ~19.0.21 | Manejo de archivos (logo base64) |
| `expo-linear-gradient` | ~15.0.7 | Gradientes visuales |
| `expo-checkbox` | ^5.0.7 | Checkboxes |
| `@react-native-async-storage/async-storage` | 2.2.0 | Almacenamiento local |
| `@react-native-community/netinfo` | ^11.4.1 | Detectar conexión |
| `@react-native-community/datetimepicker` | ^8.4.4 | Selector de fecha |
| `@react-navigation/native` | ^6.1.18 | Navegación |
| `@react-navigation/stack` | ^6.4.1 | Navegación stack |
| `react-native-screens` | ~4.16.0 | Optimización pantallas |
| `react-native-gesture-handler` | ~2.28.0 | Gestos táctiles |
| `react-native-safe-area-context` | ~5.6.0 | Safe areas |
| `react-native-elements` | ^3.4.3 | Componentes UI |
| `react-native-vector-icons` | ^10.2.0 | Iconos |
| `react-native-svg` | 15.12.1 | SVG support |

---

## 🔧 Solución de Problemas

### Error: "Unable to find expo in this project"
```bash
npm install expo
```

### Error de permisos de cámara
- Asegúrate de tener Expo Go actualizado
- Reinstala la app Expo Go en tu celular

### No conecta al servidor
1. Verifica que Django esté corriendo con `python manage.py runserver 0.0.0.0:8000`
2. Verifica que el celular y PC estén en la **misma red WiFi**
3. Verifica la IP en `config.js`

### La app se queda cargando
- Arrastra hacia abajo para refrescar
- Verifica conexión WiFi

---

## 📱 Ejecutar en Producción (APK)

Para generar un APK de producción:
```bash
npx expo build:android
```

O usando EAS Build:
```bash
npx eas build --platform android
```

---

## 📞 Soporte

Contactar al equipo de desarrollo para cualquier problema.

---

*Última actualización: 21 de Diciembre 2025*
