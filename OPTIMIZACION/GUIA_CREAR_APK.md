# 📱 GUÍA PARA CREAR APK DE ANDROID CON EAS

**Fecha**: 2026-02-03  
**Versión de app**: 3.0.0  
**Package**: com.johni1981.reactnativecourse

---

## ✅ REQUISITOS PREVIOS

Antes de empezar, asegúrate de tener:

1. ✅ **Node.js instalado** (v14 o superior)
   ```bash
   node --version
   ```

2. ✅ **npm o yarn instalado**
   ```bash
   npm --version
   ```

3. ✅ **Expo CLI instalado globalmente**
   ```bash
   npm install -g eas-cli
   ```

4. ✅ **Cuenta en Expo** (https://expo.dev)
   - Si no tienes, crea una gratis

5. ✅ **Git instalado** (opcional pero recomendado)

---

## 🚀 PASO 1: LOGIN EN EAS

Abre la terminal en la carpeta del proyecto y ejecuta:

```bash
eas login
```

**¿Qué pasa?**
- Te pedirá tu email y contraseña de Expo
- Ingresa tus credenciales
- Verás: `✓ Logged in as [tu-email]`

---

## 🔨 PASO 2: CREAR EL APK

Ejecuta este comando:

```bash
eas build --platform android --profile preview
```

**¿Qué significa?**
- `--platform android` → Crear para Android
- `--profile preview` → Usar perfil "preview" (genera APK)

**¿Qué pasa?**
- Mostrará un resumen de la configuración
- Preguntará si quieres continuar
- Escribe: `y` (yes) y presiona Enter

---

## ⏳ PASO 3: ESPERAR A QUE SE CONSTRUYA

El proceso tarda **5-15 minutos** dependiendo de:
- Velocidad de internet
- Tamaño de la app
- Servidores de Expo

**Verás algo como:**
```
Building for Android...
[████████████████████] 50%
[████████████████████████████████] 100%
✓ Build complete!
```

---

## 📥 PASO 4: DESCARGAR EL APK

Cuando termine, verás:

```
✓ Build finished!
📱 Download URL: https://expo.dev/artifacts/...
```

**Opciones para descargar:**

### Opción A: Desde la terminal
- Copia el link que aparece
- Abre en tu navegador
- Descarga el archivo `.apk`

### Opción B: Desde Expo Dashboard
1. Ve a https://expo.dev
2. Inicia sesión
3. Busca tu proyecto "AG"
4. Haz clic en el build más reciente
5. Descarga el APK

---

## 📱 PASO 5: INSTALAR EN TU TELÉFONO

### Opción A: Transferencia por USB
1. Conecta tu teléfono Android por USB
2. Copia el archivo `.apk` a tu teléfono
3. Abre el archivo desde el teléfono
4. Instala la app

### Opción B: Descarga directa
1. Descarga el APK en tu teléfono
2. Abre el archivo
3. Instala la app

### Opción C: QR Code
- Algunos builds generan un QR
- Escanea con tu teléfono
- Descarga e instala

---

## ✅ VERIFICACIÓN

Después de instalar, verifica:

- [ ] App abre sin errores
- [ ] Login funciona
- [ ] Conecta a `https://aglogistics.tech` (producción)
- [ ] Sugeridos funciona
- [ ] Cargue funciona
- [ ] Ventas funciona
- [ ] Sincronización funciona

---

## 🔄 PRÓXIMAS VECES

Para futuras actualizaciones:

1. Haz cambios en el código
2. Aumenta la versión en `app.json`:
   ```json
   "version": "3.0.1"  // Cambiar de 3.0.0 a 3.0.1
   ```
3. Ejecuta:
   ```bash
   eas build --platform android --profile preview
   ```

---

## ⚠️ SOLUCIÓN DE PROBLEMAS

### Error: "Not logged in"
```bash
eas login
```

### Error: "Project not found"
```bash
eas project:init
```

### Error: "Build failed"
- Verifica que `app.json` esté correcto
- Verifica que `eas.json` esté correcto
- Intenta de nuevo

### El APK no instala
- Verifica que tu teléfono permita instalar apps de fuentes desconocidas
- Ve a: Configuración → Seguridad → Permitir instalación de apps desconocidas

---

## 📊 INFORMACIÓN DEL BUILD

**Configuración actual**:
- Versión: 3.0.0
- Package: com.johni1981.reactnativecourse
- Min SDK: 21 (Android 5.0+)
- Permisos: Cámara, Almacenamiento, Internet
- Icono: assets/icono.png

---

## 🎯 RESUMEN RÁPIDO

```bash
# 1. Login
eas login

# 2. Crear APK
eas build --platform android --profile preview

# 3. Esperar 5-15 minutos

# 4. Descargar desde el link que aparece

# 5. Instalar en tu teléfono
```

---

## 📞 AYUDA

Si tienes problemas:
1. Revisa la consola de errores
2. Verifica que tengas internet
3. Intenta de nuevo
4. Contacta a soporte de Expo: https://expo.dev/support

---

**¡Listo para crear tu APK!** 🚀
