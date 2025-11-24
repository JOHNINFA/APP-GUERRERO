# 📱 Módulo de Gestión de Rutas

Módulo integrado en la Aplicación Guerrero para la gestión de rutas de vendedores y repartidores.

## 🚀 Funcionalidades

### 1. Pantalla de Inicio (InicioRutas.js)
- Pantalla de bienvenida con ícono de mapa
- Botón "Comenzar" para iniciar el flujo
- Color verde (#28a745) para acción positiva

### 2. Selección de Ruta (SeleccionarRuta.js)
- Lista de rutas disponibles:
  - ID5 RUTA SALITRE
  - ID5 RUTA CAMPIÑA
- Tarjetas con fondo blanco y bordes redondeados
- Guarda selección en AsyncStorage

### 3. Selección de Día (SeleccionarDia.js)
- Días disponibles: Lunes a Sábado
- Estados visuales:
  - Normal: Gris (#585757ff)
  - Seleccionado: Azul oscuro (#003d82)
- Animación de escala al seleccionar
- Delay de 300ms antes de navegar

### 4. Lista de Clientes (ListaClientes.js)
- Muestra clientes filtrados por ruta y día
- Información por cliente:
  - Nombre y tipo de negocio
  - Dirección y teléfono
  - Estado de visita
- Acciones:
  - Marcar como visitado (con timestamp)
  - Navegar con Google Maps
  - Limpiar todas las visitas

## 🎨 Esquema de Colores

- **Azul oscuro**: `#003d82` (botones principales)
- **Verde éxito**: `#28a745` (visitados, comenzar)
- **Rojo eliminar**: `#dc3545` (limpiar)
- **Gris base**: `#585757ff` (botones normales)
- **Gris claro**: `#f8f9fa` (fondos)

## 🏗️ Estructura de Archivos

```
components/rutas/
├── InicioRutas.js          # Pantalla de bienvenida
├── SeleccionarRuta.js      # Selección de ruta
├── SeleccionarDia.js       # Selección de día
├── ListaClientes.js        # Lista de clientes
└── README.md               # Esta documentación

services/
└── sheetsService.js        # Servicio de Google Sheets

assets/
└── map-outline.svg         # Ícono de mapa
```

## 📊 Flujo de Navegación

1. **OptionsScreen** → Botón "Rutas"
2. **InicioRutas** → Botón "Comenzar"
3. **SeleccionarRuta** → Seleccionar ruta
4. **SeleccionarDia** → Seleccionar día
5. **ListaClientes** → Gestionar visitas

## 💾 Almacenamiento Local

### AsyncStorage Keys:
- `rutaSeleccionada`: ID de la ruta elegida
- `diaSeleccionado`: Código del día (L, M, X, J, V, S)
- `diaNombreSeleccionado`: Nombre completo del día
- `visitados_${ruta}_${dia}`: Estado de visitas por ruta/día

## 🔄 Integración con Google Sheets

El servicio `sheetsService.js` está preparado para conectar con Google Sheets:

### Funciones disponibles:
- `obtenerClientesPorRuta(ruta)`: Obtiene clientes de una ruta
- `filtrarClientesPorDia(clientes, dia)`: Filtra por día de visita
- `guardarVisita(clienteId, ruta, dia, timestamp)`: Guarda visita

### Para activar la integración real:
1. Crear Google Apps Script con endpoints
2. Actualizar `GOOGLE_SHEETS_API_URL` en `sheetsService.js`
3. Descomentar código de fetch en las funciones

## 📱 Características Técnicas

- **React Native** con Expo
- **AsyncStorage** para persistencia local
- **Animated API** para animaciones
- **Linking API** para Google Maps
- **Stack Navigator** para navegación

## 🚀 Uso

El módulo se accede desde el menú principal (OptionsScreen):

```javascript
// No requiere que se presione "Cargue" primero
navigation.navigate('InicioRutas')
```

## 📝 Datos Mock

Actualmente usa datos de ejemplo en `sheetsService.js`:
- 4 clientes para ID5_SALITRE
- 3 clientes para ID5_CAMPIÑA

Cada cliente tiene:
- ID único
- Nombre
- Días de visita (L/M/X/J/V/S)
- Dirección
- Teléfono
- Tipo de negocio

## 🔧 Próximas Mejoras

- [ ] Conectar con Google Sheets real
- [ ] Agregar más rutas
- [ ] Sincronización en tiempo real
- [ ] Reportes de visitas
- [ ] Geolocalización automática
- [ ] Fotos de evidencia
- [ ] Firma digital del cliente
