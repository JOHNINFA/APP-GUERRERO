# Plan de Sincronización de Productos (App Móvil)

Este documento detalla el plan para asegurar que los cambios en los nombres de productos realizados en el CRM se reflejen correctamente en la aplicación móvil **AP GUERRERO**, específicamente en los módulos de **Ventas** y **Cargue**.

## 🚨 Diagnóstico del Problema

Actualmente, existen dos comportamientos diferentes en la aplicación:

1.  **Módulo de Ventas**:
    *   Usa una lista de productos descargada del servidor.
    *   **Problema**: Solo se actualiza al abrir la App. Si cambias un nombre en el CRM, el vendedor no lo ve hasta que reinicia la App.
2.  **Módulo de Cargue (Pantalla de Inventario Diario)**:
    *   **Problema Crítico**: Usa una lista **FIJA (Hardcoded)** escrita en el código.
    *   **Consecuencia**: Si cambias un nombre en el CRM o creas un producto nuevo, **NUNCA** aparecerá en esta pantalla, sin importar cuántas veces reinicies la App.

## 🛠️ Solución Implementada

El objetivo es conectar ambas pantallas a la base de datos real del CRM y facilitar la actualización de datos.

### ✅ Paso 1: Servicio de Datos (`ventasService.js`)
El servicio ya tiene implementado:
- `sincronizarProductos()`: Descarga productos del servidor usando `precio_cargue`
- `obtenerProductos()`: Retorna productos desde memoria/caché
- `inicializarProductos()`: Carga productos al iniciar la app

### ✅ Paso 2: Pantalla de Cargue Reparada (`Cargue.js`)
**Cambios implementados:**

1. **Eliminada lista hardcoded** (líneas 28-60)
2. **Agregado estado dinámico:**
   ```javascript
   const [productos, setProductos] = useState([]);
   ```

3. **Nueva función `cargarProductos()`:**
   ```javascript
   const cargarProductos = async () => {
     const productosData = obtenerProductos();
     const productosCargue = productosData
       .filter(p => p.nombre)
       .map(p => p.nombre);
     setProductos(productosCargue);
   };
   ```

4. **Nueva función `sincronizarProductosManual()`:**
   ```javascript
   const sincronizarProductosManual = async () => {
     await sincronizarProductos();
     await cargarProductos();
     Alert.alert('Éxito', 'Productos actualizados correctamente');
   };
   ```

5. **Carga automática al montar:**
   ```javascript
   useEffect(() => {
     cargarProductos();
   }, []);
   ```

### ✅ Paso 3: Botón de Sincronización Manual
Agregado botón "🔄 Actualizar Productos" en la pantalla de Cargue:
- Descarga productos actualizados del servidor
- Recarga la lista local
- Muestra confirmación al usuario

## ✅ Resultado Obtenido

1.  **✅ Consistencia Total**: Un cambio de nombre en el CRM ahora se refleja en **Ventas** y **Cargue** tras sincronizar.
2.  **✅ Nuevos Productos**: Al crear un producto nuevo en el CRM, aparece automáticamente en la App tras presionar "Actualizar Productos".
3.  **✅ Control Manual**: El vendedor puede actualizar productos en cualquier momento sin reiniciar la App.

## 📋 Cómo Usar

### Para el Administrador (CRM Web):
1. Ir a **Productos** en el sidebar del CRM
2. Crear o editar un producto
3. Cambiar el nombre (ej: "AREPA MEDIA 300Gr" → "AREPA MEDIANA 330Gr")
4. Guardar cambios

### Para el Vendedor (App Móvil):

**¡Sincronización Automática!** 🎉

Los productos se actualizan automáticamente al abrir cualquiera de estos módulos:

#### 📦 Módulo Cargue:
1. Abrir **Cargue**
2. ✅ Los productos se sincronizan automáticamente en segundo plano
3. Los nuevos nombres aparecen inmediatamente

#### 📤 Módulo Sugeridos:
1. Abrir **Sugerido**
2. ✅ Los productos se sincronizan automáticamente en segundo plano
3. Los nuevos nombres aparecen inmediatamente

#### 📊 Módulo Rendimiento:
1. Abrir **Rendimiento**
2. ✅ Los productos se sincronizan automáticamente en segundo plano
3. Los nuevos nombres aparecen inmediatamente

**Nota:** La sincronización ocurre en segundo plano sin bloquear la interfaz. Si no hay conexión, usa los productos en caché.

## 🔧 Archivos Modificados

### 1. `AP GUERRERO/components/Cargue.js`
- ❌ Eliminada lista hardcoded de 36 productos
- ✅ Agregado `obtenerProductos()` del servicio
- ✅ Sincronización automática en segundo plano al abrir
- ✅ Carga desde caché primero (instantáneo)
- ✅ Actualiza en segundo plano sin bloquear UI

### 2. `AP GUERRERO/components/ProductList.js` (Sugeridos)
- ❌ Eliminado `import productos from './Productos'`
- ✅ Agregado `obtenerProductos()` del servicio
- ✅ Sincronización automática en segundo plano al abrir
- ✅ Carga desde caché primero (instantáneo)
- ✅ Productos formateados con `name` e `id`

### 3. `AP GUERRERO/components/Vencidas.js` (Rendimiento)
- ❌ Eliminada lista hardcoded `orderOfProducts`
- ✅ Agregado `obtenerProductos()` del servicio
- ✅ Sincronización automática en segundo plano al abrir
- ✅ Carga desde caché primero (instantáneo)
- ✅ Extrae solo nombres de productos

### 4. `AP GUERRERO/PLAN_SINCRONIZACION_PRODUCTOS.md`
- ✅ Documentación actualizada con todos los cambios
