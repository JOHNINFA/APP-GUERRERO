# 📱 MÓDULO VENTAS - APP GUERRERO

## 🎯 Objetivo del Proyecto
Crear un módulo de ventas móvil optimizado que combine lo mejor del **POS del CRM** y la interfaz simple de **Sugeridos**, adaptado para uso en campo por vendedores.

---

## 📊 Análisis de Referencias

### **POS del CRM (Web):**
- ✅ Búsqueda de productos
- ✅ Carrito de compras con cálculos
- ✅ Control de cantidades (+/-)
- ✅ Subtotal, descuentos, total
- ✅ Notas opcionales
- ✅ Botón de pago/finalizar

### **Sugeridos (App Móvil):**
- ✅ Lista de productos fija (39 productos)
- ✅ Input para cantidad por producto
- ✅ Diseño simple y directo
- ✅ Botón de enviar todo

### **Cargue (App Móvil):**
- ✅ Checkboxes V/D
- ✅ Cantidades solo lectura
- ✅ Selector de días
- ✅ Diseño optimizado para móvil

---

## 🏗️ Arquitectura del Módulo

### **Estructura de Archivos:**

```
AP GUERRERO/
├── components/
│   ├── Ventas/
│   │   ├── VentasScreen.js          ← Pantalla principal
│   │   ├── ClienteSelector.js       ← Búsqueda/Selección de clientes
│   │   ├── ProductoBusqueda.js     ← Buscador de productos
│   │   ├── CarritoVentas.js        ← Carrito optimizado móvil
│   │   ├── ResumenVenta.js         ← Resumen y totales
│   │   ├── DevolucionesVencidas.js ← Gestión de devoluciones
│   │   ├── ClienteModal.js         ← Modal para crear/editar cliente
│   │   └── VentaModal.js           ← Modal confirmación de venta
│   └── ...
└── services/
    └── ventasService.js             ← Lógica de negocio (hardcoded)
```

---

## 📱 Diseño de la Interfaz

### **Pantalla Principal: VentasScreen**

#### **Sección 1: Header (Fijo arriba)**
```
┌─────────────────────────────────┐
│  👤 Cliente: [Buscar/Seleccionar]│
│  📞 Cel: 123456789               │
│  📍 Dir: Calle 123               │
└─────────────────────────────────┘
```

#### **Sección 2: Búsqueda de Productos**
```
┌─────────────────────────────────┐
│  🔍 Buscar producto...           │
└─────────────────────────────────┘
```

#### **Sección 3: Productos (Scrollable)**
```
┌─────────────────────────────────┐
│ [AREPA TIPO OBLEA]  [-] 5 [+]  │
│ Precio: $2,000   Total: $10,000│
├─────────────────────────────────┤
│ [AREPA MEDIANA]     [-] 0 [+]  │
│ Precio: $1,500   Total: $0     │
└─────────────────────────────────┘
```

#### **Sección 4: Acciones Rápidas**
```
┌─────────────────────────────────┐
│ [Devoluciones] [Vencidas]       │
└─────────────────────────────────┘
```

#### **Sección 5: Resumen (Fijo abajo)**
```
┌─────────────────────────────────┐
│ Subtotal: $50,000               │
│ Desc:     $2,000                │
│ Total:    $48,000               │
│                                 │
│ [   COMPLETAR VENTA ($48k)   ] │
└─────────────────────────────────┘
```

---

## 🗂️ Estructura de Datos

### **Cliente:**
```javascript
{
  id: 'CLI-001',
  nombre: 'Juan Pérez',
  negocio: 'Tienda El Sol',
  celular: '3001234567',
  direccion: 'Calle 123 #45-67',
  activo: true
}
```

### **Producto en Carrito:**
```javascript
{
  id: 1,
  nombre: 'AREPA TIPO OBLEA',
  precio: 2000,
  cantidad: 5,
  subtotal: 10000
}
```

### **Venta:**
```javascript
{
  id: 'VEN-001',
  fecha: '2025-11-22',
  cliente_id: 'CLI-001',
  vendedor: 'ID1',
  productos: [...],
  subtotal: 50000,
  descuento: 2000,
  total: 48000,
  devoluciones: [],
  vencidas: [],
  nota: 'Entrega urgente',
  estado: 'completada'
}
```

---

## 🎨 Flujo de Usuario

### **1. Inicio de Venta**
1. Usuario presiona botón "🛒 Ventas" (nuevo, arriba de Cargue)
2. Se abre VentasScreen
3. Por defecto muestra "Cliente General"

### **2. Seleccionar Cliente**
1. Usuario toca selector de cliente
2. Se abre modal con:
   - Lista de clientes guardados (búsqueda rápida)
   - Botón "➕ Nuevo Cliente"
3. Al seleccionar, se cargan sus datos

### **3. Agregar Productos**
1. Usuario busca producto por nombre
2. Lista se filtra en tiempo real
3. Usuario ajusta cantidad con +/-
4. Total se actualiza automáticamente

### **4. Devoluciones/Vencidas** (Opcional)
1. Usuario presiona botón "Devoluciones" o "Vencidas"
2. Se abre modal con misma lista de productos
3. Usuario ingresa cantidades
4. Se registra en la venta

### **5. Completar Venta**
1. Usuario presiona "COMPLETAR VENTA"
2. Se muestra modal de confirmación:
   - Resumen de la venta
   - Botón "Confirmar" / "Cancelar"
   - Opción "Imprimir"
3. Al confirmar:
   - Se guarda localmente (AsyncStorage)
   - Se muestra mensaje de éxito
   - Se limpia el carrito

---

## 🔧 Plan de Implementación

### **✅ Fase 1: Interfaz Básica** (Primera entrega)
- [ ] Pantalla VentasScreen
- [ ] Selector de cliente (hardcoded inicial)
- [ ] Lista de productos con búsqueda
- [ ] Control de cantidades (+/-)
- [ ] Cálculo automático de totales
- [ ] Botón completar venta
- [ ] Modal de confirmación
- [ ] Guardar venta en AsyncStorage

### **⏳ Fase 2: Gestión de Clientes** (Segunda entrega)
- [ ] Modal ClienteSelector con lista
- [ ] Búsqueda de clientes
- [ ] Modal ClienteModal para crear/editar
- [ ] Guardar clientes en AsyncStorage
- [ ] Validación de datos

### **⏳ Fase 3: Devoluciones y Vencidas** (Tercera entrega)
- [ ] Botones rápidos
- [ ] Modal DevolucionesVencidas
- [ ] Registro en la venta
- [ ] Visualización en resumen

### **⏳ Fase 4: Impresión** (Cuarta entrega)
- [ ] Formato de ticket
- [ ] Integración con impresora Bluetooth
- [ ] Preview de impresión

### **⏳ Fase 5: Conexión al CRM** (Futura)
- [ ] Endpoints en Django
- [ ] Sincronización de ventas
- [ ] Sincronización de clientes
- [ ] Manejo de conflictos

---

## 📦 Datos Hardcodeados

### **Clientes de Prueba:**
```javascript
const clientesPrueba = [
  { id: 'CLI-001', nombre: 'CLIENTE GENERAL', negocio: 'N/A', celular: '', direccion: '' },
  { id: 'CLI-002', nombre: 'Juan Pérez', negocio: 'Tienda El Sol', celular: '3001234567', direccion: 'Calle 123' },
  { id: 'CLI-003', nombre: 'María López', negocio: 'Súper La Esquina', celular: '3109876543', direccion: 'Carrera 45' },
];
```

### **Productos:**
- Lista de 39 productos de `Cargue.js`
- Precio hardcodeado por producto
- Sin stock (infinito por ahora)

---

## 🎯 Diferencias Clave vs POS Web

| Característica | POS Web | Ventas App |
|----------------|---------|------------|
| **Búsqueda** | Barra + categorías | Solo barra (simple) |
| **Tarjetas** | Tarjetas grandes con imagen | Lista compacta |
| **Carrito** | Panel lateral | Lista inline con productos |
| **Pago** | Modal complejo | Modal simple |
| **Impuestos** | Campo editable | No (por ahora) |
| **Listas de Precio** | Sí | No (precio fijo) |
| **Impresión** | Ticket térmico | Bluetooth móvil |

---

## ⚡ Optimizaciones Móviles

1. **Scroll Optimizado**: FlatList para 39+ productos
2. **Búsqueda Instantánea**: Filtrado local sin delays
3. **Touch Amigable**: Botones grandes (+/-)
4. **Teclado Numérico**: Input type="number" para cantidades
5. **Guardado Automático**: AsyncStorage para persistencia
6. **Offline First**: Funciona sin internet

---

## 🎨 Paleta de Colores

- **Principal**: `#00ad53` (verde, como botones actuales)
- **Secundario**: `#003d88` (azul oscuro, como navbar)
- **Fondo**: `#f5f5f5` (gris suave)
- **Texto**: `#696969` (gris medio)
- **Bordes**: `#66b3ff` (azul claro)

---

## ⏱️ Estimación de Tiempo

- **Fase 1** (Interfaz básica): ~2-3 horas
- **Fase 2** (Gestión clientes): ~1-2 horas
- **Fase 3** (Devoluciones/Vencidas): ~1 hora
- **Fase 4** (Impresión): ~2-3 horas
- **Fase 5** (Conexión CRM): ~4-5 horas

**Total estimado**: 10-14 horas de desarrollo

---

## 📝 Registro de Progreso

### **🚀 Inicio del Proyecto**
**Fecha**: 2025-11-22 13:35  
**Estado**: En desarrollo - Fase 1  
**Siguiente paso**: Testing de la interfaz básica

---

### **✅ Tareas Completadas**

#### 2025-11-22 - 13:35
- ✅ Análisis del POS del CRM
- ✅ Análisis del módulo Sugeridos
- ✅ Diseño de arquitectura
- ✅ Creación del plan de trabajo
- ✅ Creación del README

#### 2025-11-22 - 13:40
- ✅ Creado `services/ventasService.js` con datos hardcodeados
- ✅ Creada carpeta `components/Ventas/`
- ✅ Creado `VentasScreen.js` con interfaz completa
- ✅ Agregado botón "Ventas" al menú (`OptionsScreen.js`)
- ✅ Configurada navegación en `App.js`
- ✅ Implementada búsqueda de productos
- ✅ Implementado control de cantidades (+/-)
- ✅ Implementado cálculo automático de totales
- ✅ Implementado botón "Completar Venta"
- ✅ Implementado guardado en AsyncStorage

#### 2025-11-22 - 13:50
- ✅ Creado `ClienteSelector.js` - Modal para seleccionar clientes
- ✅ Creado `ClienteModal.js` - Modal para crear nuevos clientes
- ✅ Integrados modales en `VentasScreen.js`
- ✅ Implementada búsqueda de clientes en tiempo real
- ✅ Implementado guardado de clientes en AsyncStorage
- ✅ Validación de formulario de clientes
- ✅ Flujo completo: Seleccionar cliente → Crear cliente → Asignar a venta

#### 2025-11-22 - 14:10
- ✅ Creado `DevolucionesVencidas.js` - Modal reutilizable
- ✅ Botones "Devoluciones" y "Vencidas" en interfaz
- ✅ Badges con contador de productos
- ✅ Integración completa en VentasScreen
- ✅ Estados de devoluciones y vencidas
- ✅ Guardado incluido en la venta
- ✅ Implementada cámara para evidencia de vencidas
- ✅ Validación de foto obligatoria para vencidas

#### 2025-11-22 - 14:25
- ✅ Creado `services/printerService.js`
- ✅ Generación de HTML para ticket de venta
- ✅ Integración con `expo-print` y `expo-sharing`
- ✅ Opción de imprimir al finalizar venta
- ✅ Formato de ticket profesional (58mm/80mm)

---

### **🔄 Tareas en Progreso**

#### Fase 2: Gestión de Clientes (Finalizando)
- 🔄 Testing de modales de cliente
- 🔄 Ajustes visuales finales

---

### **⏳ Tareas Pendientes**

#### Fase 1: Interfaz Básica ✅ COMPLETADA
- [x] Crear carpeta `components/Ventas/`
- [x] Crear `VentasScreen.js`
- [x] Crear `services/ventasService.js`
- [x] Implementar lista de productos
- [x] Implementar buscador
- [x] Implementar control de cantidades
- [x] Implementar cálculo de totales
- [x] Agregar botón "Ventas" al menú
- [x] Configurar navegación en `App.js`
- [x] Testing básico
- [x] Ajustes finales de UX

#### Fase 2: Gestión de Clientes ✅ COMPLETADA
- [x] Modal ClienteSelector con lista
- [x] Búsqueda de clientes
- [x] Modal ClienteModal para crear/editar
- [x] Guardar clientes en AsyncStorage
- [x] Validación de datos

#### Fase 3: Devoluciones y Vencidas
- [ ] Botones rápidos
- [ ] Modal DevolucionesVencidas
- [ ] Registro en la venta
- [ ] Visualización en resumen

---

## 🐛 Problemas Conocidos

_Ninguno por el momento_

---

## 💡 Notas de Desarrollo

### URLs Comentadas
Todas las URLs de Google Sheets están comentadas en:
- `components/Cargue.js`
- `components/ProductList.js`
- `components/Vencidas.js`
- `services/sheetsService.js`
- `LoginScreen.js`

### Usuarios Hardcodeados
- ID1-ID6: password `1234`
- admin: password `admin`

---

## 📚 Recursos

- [Documentación React Native](https://reactnative.dev/)
- [Expo Documentation](https://docs.expo.dev/)
- [AsyncStorage](https://react-native-async-storage.github.io/async-storage/)

---

## 👥 Contacto

**Desarrollador**: Antigravity AI  
**Cliente**: John  
**Proyecto**: CRM Fábrica - APP GUERRERO

---

_Última actualización: 2025-11-22 13:35_
