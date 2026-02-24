// ⚠️ SERVICIO DE VENTAS - CONECTADO A API
// Este servicio maneja la lógica de negocio de ventas y sincroniza productos
// ✅ INCLUYE: Cola de sincronización offline

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { enviarVentaRuta } from './rutasApiService';
import { API_URL } from '../config';
import * as Device from 'expo-device';  // 🆕 Para obtener info del dispositivo
import Constants from 'expo-constants';  // 🆕 Para info adicional

const API_BASE = `${API_URL}/api`;

// ==================== SISTEMA MULTI-DISPOSITIVO ====================

/**
 * 🆕 Obtiene o genera un ID único del dispositivo
 * Formato: OS-MODELO-RANDOM (ej: ANDROID-SM-G991B-K3J9X2)
 * Se guarda en AsyncStorage para mantener el mismo ID entre sesiones
 */
export const obtenerDispositivoId = async () => {
    try {
        // Intentar obtener de caché
        let deviceId = await AsyncStorage.getItem('DEVICE_ID');

        if (!deviceId) {
            // Generar nuevo ID basado en info del dispositivo
            const os = Device.osName || 'UNKNOWN';  // ANDROID, IOS, etc.
            const modelo = Device.modelName || Device.deviceName || 'DEVICE';
            const random = Math.random().toString(36).substr(2, 6).toUpperCase();

            // Limpiar modelo (remover espacios y caracteres especiales)
            const modeloLimpio = modelo.replace(/[^a-zA-Z0-9]/g, '-').substr(0, 20);

            deviceId = `${os}-${modeloLimpio}-${random}`.toUpperCase();

            // Guardar en caché para futuras ejecuciones
            await AsyncStorage.setItem('DEVICE_ID', deviceId);
            console.log('📱 Dispositivo ID generado:', deviceId);
        } else {
            console.log('📱 Dispositivo ID desde caché:', deviceId);
        }

        return deviceId;
    } catch (error) {
        console.error('Error obteniendo device ID:', error);
        // Fallback: generar ID aleatorio
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9).toUpperCase();
        return `DEVICE-${timestamp}-${random}`;
    }
};


// ==================== COLA DE SINCRONIZACIÓN OFFLINE ====================
const COLA_PENDIENTES_KEY = 'ventas_pendientes_sync';
let sincronizandoCola = false;

/**
 * Obtiene las ventas pendientes de sincronizar
 */
export const obtenerVentasPendientes = async () => {
    try {
        const pendientes = await AsyncStorage.getItem(COLA_PENDIENTES_KEY);
        return pendientes ? JSON.parse(pendientes) : [];
    } catch (error) {
        console.error('Error obteniendo ventas pendientes:', error);
        return [];
    }
};

/**
 * Agrega una venta a la cola de pendientes
 */
const agregarAColaPendientes = async (ventaBackend, ventaId) => {
    try {
        const pendientes = await obtenerVentasPendientes();
        pendientes.push({
            id: ventaId,
            data: ventaBackend,
            intentos: 0,
            fechaCreacion: new Date().toISOString()
        });
        await AsyncStorage.setItem(COLA_PENDIENTES_KEY, JSON.stringify(pendientes));
        console.log(`📥 Venta ${ventaId} agregada a cola de pendientes`);
    } catch (error) {
        console.error('Error agregando a cola:', error);
    }
};

/**
 * Elimina una venta de la cola de pendientes
 */
const eliminarDeColaPendientes = async (ventaId) => {
    try {
        const pendientes = await obtenerVentasPendientes();
        const idObjetivo = String(ventaId);
        const nuevasPendientes = pendientes.filter((v) => {
            const idActual = String(v?.id || v?.data?.id_local || v?.data?.id || '');
            return idActual !== idObjetivo;
        });
        await AsyncStorage.setItem(COLA_PENDIENTES_KEY, JSON.stringify(nuevasPendientes));
        console.log(`✅ Venta ${ventaId} eliminada de cola de pendientes`);
    } catch (error) {
        console.error('Error eliminando de cola:', error);
    }
};

/**
 * Marca una venta local como sincronizada para evitar que vuelva a rehidratarse.
 */
const marcarVentaLocalSincronizada = async (ventaId) => {
    try {
        const ventas = await obtenerVentas();
        const actualizadas = ventas.map((v) =>
            String(v?.id) === String(ventaId)
                ? { ...v, sincronizada: true, estado: 'ACTIVA' }
                : v
        );
        await AsyncStorage.setItem('ventas', JSON.stringify(actualizadas));
    } catch (error) {
        console.warn(`⚠️ No se pudo marcar venta local ${ventaId} como sincronizada:`, error.message);
    }
};

/**
 * Normaliza payload para backend (compatibilidad con ventas antiguas de cola).
 */
const normalizarVentaParaBackend = (ventaData, dispositivoIdFallback = '') => {
    const data = { ...(ventaData || {}) };

    // Backend de VentaRuta acepta ACTIVA/ANULADA. Algunos registros viejos tenían "completada".
    const estadoRaw = String(data?.estado || '')
        .replace(/"/g, '')
        .trim()
        .toUpperCase();
    data.estado = (estadoRaw === 'ANULADA' || estadoRaw === 'ANULADO') ? 'ANULADA' : 'ACTIVA';

    if (!data.dispositivo_id && dispositivoIdFallback) {
        data.dispositivo_id = dispositivoIdFallback;
    }

    // Compatibilidad con colas antiguas (detalles/productos e ids locales)
    if (!Array.isArray(data.detalles) && Array.isArray(data.productos)) {
        data.detalles = data.productos;
    }
    if (!data.id_local && data.id) {
        data.id_local = data.id;
    }

    return data;
};

/**
 * Reconstruye la cola desde ventas locales no sincronizadas.
 * Evita pérdida de ventas si alguna salida inesperada dejó la cola vacía.
 */
const rehidratarColaDesdeVentasLocales = async () => {
    try {
        const [ventasLocales, pendientesActuales] = await Promise.all([
            obtenerVentas(),
            obtenerVentasPendientes()
        ]);

        const idsPendientes = new Set(
            pendientesActuales
                .map((p) => p?.id)
                .filter(Boolean)
                .map((id) => String(id))
        );

        const nuevosPendientes = [...pendientesActuales];
        let agregadas = 0;

        for (const venta of ventasLocales) {
            if (!venta?.id) continue;
            if (venta?.sincronizada === true) continue;
            if (String(venta?.estado || '').toUpperCase() === 'ANULADA') continue;

            const idLocal = String(venta.id);
            if (idsPendientes.has(idLocal)) continue;

            const ventaBackend = {
                ...venta,
                id_local: venta.id,
                vendedor: venta.vendedor_id || venta.vendedor,
                cliente_nombre: venta.cliente_nombre,
                nombre_negocio: venta.cliente_negocio || venta.nombre_negocio || '',
                total: venta.total,
                detalles: venta.detalles || venta.productos || [],
                metodo_pago: venta.metodo_pago || 'EFECTIVO',
                estado: 'ACTIVA'
            };

            nuevosPendientes.push({
                id: venta.id,
                data: ventaBackend,
                intentos: 0,
                fechaCreacion: venta.fecha || new Date().toISOString()
            });
            idsPendientes.add(idLocal);
            agregadas++;
        }

        if (agregadas > 0) {
            await AsyncStorage.setItem(COLA_PENDIENTES_KEY, JSON.stringify(nuevosPendientes));
            console.log(`♻️ Cola rehidratada: ${agregadas} venta(s) local(es) re-agregadas a pendientes`);
        }

        return agregadas;
    } catch (error) {
        console.warn('⚠️ No se pudo rehidratar la cola de pendientes:', error.message);
        return 0;
    }
};

/**
 * 🆕 Verifica si una venta ya existe en el servidor para evitar duplicados
 */
const verificarVentaExiste = async (ventaId, ventaData) => {
    try {
        // Obtener la fecha de la venta (puede venir como string ISO o como fecha corta)
        let fechaVenta = ventaData.fecha;
        if (fechaVenta && fechaVenta.includes('T')) {
            fechaVenta = fechaVenta.split('T')[0]; // Extraer solo YYYY-MM-DD
        }

        // Buscar ventas del mismo cliente
        const clienteNombre = encodeURIComponent(ventaData.cliente_nombre || '');
        const response = await fetch(`${API_BASE}/ventas-ruta/?search=${clienteNombre}`);

        if (response.ok) {
            const ventas = await response.json();

            // Buscar coincidencia exacta por: cliente + total + fecha
            const existe = ventas.some(v => {
                const mismoCliente = v.cliente_nombre?.toUpperCase() === ventaData.cliente_nombre?.toUpperCase();
                const mismoTotal = Math.abs(parseFloat(v.total) - parseFloat(ventaData.total)) < 1;
                const mismaFecha = fechaVenta && v.fecha?.includes(fechaVenta);

                if (mismoCliente && mismoTotal && mismaFecha) {
                    console.log(`🔍 Encontrada venta existente: ID ${v.id} - ${v.cliente_nombre} - $${v.total}`);
                    return true;
                }
                return false;
            });

            return existe;
        }
        return false;
    } catch (error) {
        console.warn('⚠️ No se pudo verificar si la venta existe:', error.message);
        return false; // En caso de error, asumir que no existe para intentar enviar
    }
};

/**
 * Intenta sincronizar todas las ventas pendientes
 */
export const sincronizarVentasPendientes = async () => {
    if (sincronizandoCola) {

        return { sincronizadas: 0, pendientes: 0 };
    }

    sincronizandoCola = true;
    let sincronizadas = 0;
    let yaExistentes = 0;

    try {
        const dispositivoId = await obtenerDispositivoId();

        // Recuperar pendientes desde ventas locales no sincronizadas (seguridad anti-pérdida)
        await rehidratarColaDesdeVentasLocales();

        // Verificar conexión
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {

            sincronizandoCola = false;
            const pendientes = await obtenerVentasPendientes();
            return { sincronizadas: 0, pendientes: pendientes.length };
        }

        const pendientes = await obtenerVentasPendientes();
        console.log(`🔄 Sincronizando ${pendientes.length} ventas pendientes...`);

        for (const venta of pendientes) {
            try {
                // Soporta formato nuevo {id, data, ...} y formato legado (venta directa).
                const fuenteData = venta?.data || venta;
                const ventaNormalizada = normalizarVentaParaBackend(fuenteData, dispositivoId);
                const ventaId = String(venta?.id || ventaNormalizada?.id_local || ventaNormalizada?.id || '');

                if (!ventaNormalizada.id_local && ventaId) {
                    ventaNormalizada.id_local = ventaId;
                }

                // 🆕 Verificar si la venta ya existe en el servidor
                const existe = await verificarVentaExiste(ventaId, ventaNormalizada);
                if (existe) {
                    console.log(`🔍 Venta ${ventaId} ya existe en servidor, eliminando de cola`);
                    await eliminarDeColaPendientes(ventaId);
                    await marcarVentaLocalSincronizada(ventaId);
                    yaExistentes++;
                    continue;
                }

                const resultadoEnvio = await enviarVentaRuta(ventaNormalizada);
                if (!resultadoEnvio?.success) {
                    throw new Error(resultadoEnvio?.error || 'Error enviando venta al backend');
                }

                await eliminarDeColaPendientes(ventaId);
                await marcarVentaLocalSincronizada(ventaId);
                if (resultadoEnvio.warning === 'DUPLICADO' || resultadoEnvio.warning === 'CONFLICT') {
                    yaExistentes++;
                    console.log(`ℹ️ Venta ${ventaId} ya estaba en backend (${resultadoEnvio.warning})`);
                } else {
                    sincronizadas++;
                    console.log(`✅ Venta ${ventaId} sincronizada`);
                }
            } catch (error) {
                const ventaId = String(venta?.id || venta?.data?.id_local || venta?.data?.id || 'SIN-ID');
                console.warn(`⚠️ Error sincronizando venta ${ventaId}:`, error.message);

                // ⚠️ IMPORTANTE: No eliminar ventas con error 400 para evitar pérdida de datos.
                // Se mantienen en cola para diagnóstico/reenvío manual.
                if (error.message.includes('400') || error.message.includes('HTTP 400')) {
                    console.error(`❌ Venta ${ventaId} devolvió 400; se mantiene en cola para revisión.`);
                }

                // Incrementar intentos
                venta.intentos = (venta.intentos || 0) + 1;
                try {
                    const pendientesActuales = await obtenerVentasPendientes();
                    const pendientesActualizados = pendientesActuales.map((v) =>
                        String(v?.id || v?.data?.id_local || v?.data?.id || '') === ventaId
                            ? { ...v, intentos: venta.intentos }
                            : v
                    );
                    await AsyncStorage.setItem(COLA_PENDIENTES_KEY, JSON.stringify(pendientesActualizados));
                } catch (persistError) {
                    console.warn('⚠️ No se pudo persistir intentos de sincronización:', persistError.message);
                }
                if (venta.intentos >= 5) {
                    console.error(`❌ Venta ${ventaId} falló después de 5 intentos`);
                }
            }
        }

        const pendientesRestantes = await obtenerVentasPendientes();
        console.log(`📊 Sincronización completada: ${sincronizadas} nuevas, ${yaExistentes} ya existían, ${pendientesRestantes.length} pendientes`);

        return { sincronizadas, pendientes: pendientesRestantes.length, yaExistentes };
    } catch (error) {
        console.error('Error en sincronización:', error);
        return { sincronizadas: 0, pendientes: 0, error: error.message };
    } finally {
        sincronizandoCola = false;
    }
};

/**
 * Verifica si hay conexión a internet
 */
export const hayConexion = async () => {
    try {
        const netInfo = await NetInfo.fetch();
        return netInfo.isConnected;
    } catch (error) {
        return false;
    }
};

// Lista de productos por defecto (fallback)
const PRODUCTOS_DEFAULT = [
    { id: 17, nombre: 'AREPA TIPO OBLEA 500Gr', precio: 2500.0 },
    { id: 18, nombre: 'AREPA MEDIANA 330Gr', precio: 2100.0 },
    { id: 21, nombre: 'AREPA TIPO PINCHO 330Gr', precio: 2000.0 },
    { id: 22, nombre: 'AREPA QUESO CORRIENTE 450Gr', precio: 3900.0 },
    { id: 23, nombre: 'AREPA QUESO ESPECIAL GRANDE 600Gr', precio: 6000.0 },
    { id: 24, nombre: 'AREPA CON QUESO ESPECIAL PEQUEÑA 600Gr', precio: 6000.0 },
    { id: 25, nombre: 'AREPA QUESO MINI X10', precio: 3600.0 },
    { id: 26, nombre: 'AREPA CON QUESO CUADRADA 450Gr', precio: 4500.0 },
    { id: 27, nombre: 'AREPA DE CHOCLO CORRIENTE 300Gr', precio: 3900.0 },
    { id: 28, nombre: 'AREPA DE CHOCLO CON QUESO GRANDE 1200Gr', precio: 13400.0 },
    { id: 29, nombre: 'AREPA DE CHOCLO CON QUESO PEQUEÑA 700Gr', precio: 12200.0 },
    { id: 31, nombre: 'AREPA BOYACENSE X 5 450Gr', precio: 8600.0 },
    { id: 33, nombre: 'AREPA SANTANDEREANA 450Gr', precio: 5800.0 },
    { id: 34, nombre: 'ALMOJABANA X 5 300Gr', precio: 8600.0 },
    { id: 36, nombre: 'AREPA  CON SEMILLA DE QUINUA 450Gr', precio: 4600.0 },
    { id: 37, nombre: 'AREPA DE MAIZ CON SEMILLA DE CHIA450g', precio: 4600.0 },
    { id: 38, nombre: 'AREPAS DE MAIZ PETO CON SEMILLA DE AJONJOLI 450GR', precio: 4600.0 },
    { id: 39, nombre: 'AREPA DE  MAIZ PETO CON  SEMILLAS DE LINAZA 450Gr', precio: 4600.0 },
    { id: 40, nombre: 'AREPA DE MAIZ PETO CON SEMILLAS DE GIRASOL 450Gr', precio: 4600.0 },
    { id: 41, nombre: 'AREPA DE MAIZ PETO CHORICERA 1000Gr', precio: 4700.0 },
    { id: 42, nombre: 'AREPA DE MAIZ DE PETO TIPO LONCHERIA 500Gr', precio: 2500.0 },
    { id: 43, nombre: 'AREPA DE MAIZ PETO CON MARGARINA Y SAL 500Gr', precio: 4200.0 },
    { id: 44, nombre: 'YUCAREPA 500Gr', precio: 5200.0 },
    { id: 45, nombre: 'AREPA TIPO ASADERO X 10 280Gr', precio: 800.0 },
    { id: 46, nombre: 'AREPA RELLENAR #1', precio: 6500.0 },
    { id: 47, nombre: 'AREPA PARA RELLENA #2', precio: 6500.0 },
    { id: 48, nombre: 'AREPA RELLENAR #3 1000Gr', precio: 4800.0 },
    { id: 49, nombre: 'PORCION DE AREPA X 2 UND 55Gr', precio: 160.0 },
    { id: 50, nombre: 'PORCION DE AREPA 3 UND', precio: 320.0 },
    { id: 51, nombre: 'PORCION DE AREPA 4 UND 110 GR', precio: 320.0 },
    { id: 52, nombre: 'PORCION DE AREPA 5 UND', precio: 520.0 },
    { id: 53, nombre: 'AREPA SUPER OBLEA 500Gr', precio: 2500.0 },
    { id: 54, nombre: 'LIBRA MASA', precio: 2000.0 },
    { id: 55, nombre: 'MUTE BOYACENSE', precio: 2000.0 },
    { id: 56, nombre: 'ENVUELTO DE MAÍZ 500Gr', precio: 4300.0 }
];

// Variable mutable para mantener los productos en memoria
let productosEnMemoria = [...PRODUCTOS_DEFAULT];

// Clientes de prueba
export const CLIENTES_PRUEBA = [
    {
        id: 'CLI-001',
        nombre: 'CLIENTE GENERAL',
        negocio: 'N/A',
        celular: '',
        direccion: '',
        activo: true
    },
    {
        id: 'CLI-002',
        nombre: 'Juan Pérez',
        negocio: 'Tienda El Sol',
        celular: '3001234567',
        direccion: 'Calle 123 #45-67',
        activo: true
    },
    {
        id: 'CLI-003',
        nombre: 'María López',
        negocio: 'Súper La Esquina',
        celular: '3109876543',
        direccion: 'Carrera 45 #12-34',
        activo: true
    },
    {
        id: 'CLI-004',
        nombre: 'Carlos Rodríguez',
        negocio: 'Minimercado La Esperanza',
        celular: '3158765432',
        direccion: 'Transversal 8 #23-45',
        activo: true
    },
];

// ==================== FUNCIONES DE PRODUCTOS ====================

/**
 * Inicializa los productos cargando de caché y luego del servidor
 */
export const inicializarProductos = async () => {
    try {
        // 1. Cargar de caché local
        const productosCacheados = await AsyncStorage.getItem('productos_cache');
        if (productosCacheados) {
            productosEnMemoria = JSON.parse(productosCacheados);

        }

        // 2. Intentar actualizar del servidor
        await sincronizarProductos();
    } catch (error) {
        console.error('Error inicializando productos:', error);
    }
};

/**
 * Descarga productos del servidor y actualiza caché
 * Usa precio_cargue (precio independiente para Cargue y App)
 */
export const sincronizarProductos = async () => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos

        const response = await fetch(`${API_BASE}/productos/`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();

            // Mapear al formato interno
            // Usar precio_cargue si existe, sino usar precio base
            // Incluir campos de disponibilidad de app
            const productosActualizados = data.map(p => ({
                id: p.id,
                nombre: p.nombre,
                precio: parseFloat(p.precio_cargue) > 0 ? parseFloat(p.precio_cargue) : parseFloat(p.precio) || 0,
                orden: p.orden || 999, // 🆕 Mantener orden del servidor
                disponible_app_cargue: p.disponible_app_cargue !== undefined ? p.disponible_app_cargue : true,
                disponible_app_sugeridos: p.disponible_app_sugeridos !== undefined ? p.disponible_app_sugeridos : true,
                disponible_app_rendimiento: p.disponible_app_rendimiento !== undefined ? p.disponible_app_rendimiento : true,
                disponible_app_ventas: p.disponible_app_ventas !== undefined ? p.disponible_app_ventas : true
            }));

            if (productosActualizados.length > 0) {
                productosEnMemoria = productosActualizados;
                await AsyncStorage.setItem('productos_cache', JSON.stringify(productosEnMemoria));

            }
        } else {
            console.warn('⚠️ No se pudieron descargar productos:', response.status);
        }
    } catch (error) {
        console.error('❌ Error sincronizando productos (offline?):', error.message);
    }
};

/**
 * Obtiene todos los productos (síncrono, desde memoria)
 * @returns {Array} Lista de productos
 */
export const obtenerProductos = () => {
    // ⚠️ No filtrar por nombre aquí:
    // cada módulo (Ventas/Cargue/Sugeridos/Rendimiento) decide según sus flags disponibles.
    return productosEnMemoria;
};

/**
 * Busca productos por nombre
 * @param {string} query - Término de búsqueda
 * @returns {Array} Productos filtrados
 */
export const buscarProductos = (query) => {
    // Buscar sobre catálogo en memoria; el filtrado por módulo se hace en cada pantalla.
    const productosActuales = obtenerProductos();
    if (!query || query.trim() === '') return productosActuales;

    const queryLower = query.toLowerCase();
    return productosActuales.filter(p =>
        p.nombre.toLowerCase().includes(queryLower)
    );
};

/**
 * Obtiene un producto por ID
 * @param {number} id - ID del producto
 * @returns {Object|null} Producto encontrado o null
 */
export const obtenerProductoPorId = (id) => {
    return productosEnMemoria.find(p => p.id === id) || null;
};

// ==================== FUNCIONES DE CLIENTES ====================

/**
 * Obtiene todos los clientes
 * @returns {Promise<Array>} Lista de clientes
 */
export const obtenerClientes = async () => {
    try {
        const clientesStorage = await AsyncStorage.getItem('clientes');
        if (clientesStorage) {
            return JSON.parse(clientesStorage);
        }
        // Si no hay clientes guardados, devolver los de prueba
        await AsyncStorage.setItem('clientes', JSON.stringify(CLIENTES_PRUEBA));
        return CLIENTES_PRUEBA;
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        return CLIENTES_PRUEBA;
    }
};

/**
 * Busca clientes por nombre o negocio
 * @param {string} query - Término de búsqueda
 * @returns {Promise<Array>} Clientes filtrados
 */
export const buscarClientes = async (query) => {
    const clientes = await obtenerClientes();

    if (!query || query.trim() === '') return clientes;

    const queryLower = query.toLowerCase();
    return clientes.filter(c =>
        c.nombre.toLowerCase().includes(queryLower) ||
        c.negocio.toLowerCase().includes(queryLower)
    );
};

/**
 * Guarda un nuevo cliente
 * @param {Object} cliente - Datos del cliente (con diasVisita y rutaId)
 * @returns {Promise<Object>} Cliente guardado
 */
export const guardarCliente = async (cliente) => {
    try {
        // 🆕 Validar que se haya seleccionado una ruta
        if (!cliente.rutaId) {
            throw new Error('Debes seleccionar una ruta para guardar el cliente');
        }

        const clientes = await obtenerClientes();

        // Generar ID único
        const nuevoId = `CLI-${String(clientes.length + 1).padStart(3, '0')}`;
        const nuevoCliente = {
            id: nuevoId,
            nombre: cliente.nombre,
            negocio: cliente.negocio,
            celular: cliente.celular,
            direccion: cliente.direccion,
            diasVisita: cliente.diasVisita || [],
            rutaId: cliente.rutaId,
            activo: true
        };

        // 🆕 Enviar al backend (el backend calculará el orden automáticamente)
        const clienteRutaData = {
            ruta: cliente.rutaId,
            nombre_negocio: cliente.negocio || cliente.nombre,
            nombre_contacto: cliente.nombre,
            telefono: cliente.celular || '',
            direccion: cliente.direccion || '',
            tipo_negocio: cliente.tipoNegocio || '',
            dia_visita: (cliente.diasVisita || []).join(','), // LUNES,MIERCOLES,VIERNES
            activo: true
            // ⚡ Quitamos 'orden' - el backend lo calculará automáticamente
        };

        console.log('📤 Enviando cliente al backend:', JSON.stringify(clienteRutaData));

        const response = await fetch(`${API_BASE}/clientes-ruta/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clienteRutaData)
        });

        if (response.ok) {
            const clienteGuardado = await response.json();
            console.log('✅ Cliente guardado en backend:', clienteGuardado.id);
            nuevoCliente.backendId = clienteGuardado.id;

            // Guardar localmente solo si se guardó en el backend
            clientes.push(nuevoCliente);
            await AsyncStorage.setItem('clientes', JSON.stringify(clientes));

            return nuevoCliente;
        } else {
            const errorText = await response.text();
            console.error('❌ Error guardando cliente en backend:', response.status, errorText);
            throw new Error(`No se pudo guardar el cliente en el servidor: ${errorText}`);
        }
    } catch (error) {
        console.error('Error al guardar cliente:', error);
        throw error;
    }
};

// ==================== FUNCIONES DE VENTAS ====================

/**
 * Calcula el subtotal de los productos
 * @param {Array} productos - Array de productos con cantidad
 * @returns {number} Subtotal
 */
export const calcularSubtotal = (productos) => {
    return productos.reduce((total, p) => {
        return total + (p.precio * p.cantidad);
    }, 0);
};

/**
 * Genera ID único para venta
 * @returns {Promise<string>} ID de venta
 */
/**
 * 🆕 Genera ID único para venta con formato anti-colisión
 * Formato: VENDEDOR-DISPOSITIVO-TIMESTAMP-RANDOM
 * Ejemplo: ID1-ANDROID-SAMSUNG-K3J9X2-1737145200000-P9Q2X1
 */
const generarIdVenta = async (vendedorId) => {
    try {
        const deviceId = await obtenerDispositivoId();
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 6).toUpperCase();

        // Formato largo y único
        const idVenta = `${vendedorId}-${deviceId}-${timestamp}-${random}`;

        console.log('🆔 ID Venta generado:', idVenta);
        return idVenta;
    } catch (error) {
        console.error('Error generando ID venta:', error);
        // Fallback
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9).toUpperCase();
        return `${vendedorId}-UNKNOWN-${timestamp}-${random}`;
    }
};

/**
 * Guarda una venta
 * @param {Object} venta - Datos de la venta
 * @returns {Promise<Object>} Venta guardada
 */


/**
 * 🆕 Convierte un diccionario de URIs de fotos a base64
 * @param {object} fotosDict - { productoId: [uri1, uri2, ...] }
 * @returns {object} - { productoId: [base64_1, base64_2, ...] }
 */
export const convertirFotosABase64 = async (fotosDict) => {
    if (!fotosDict || Object.keys(fotosDict).length === 0) return null;

    const fotosBase64 = {};
    for (const [key, uris] of Object.entries(fotosDict)) {
        fotosBase64[key] = [];
        for (const uri of uris) {
            if (uri.startsWith('data:')) {
                fotosBase64[key].push(uri);
            } else {
                try {
                    const response = await fetch(uri);
                    const blob = await response.blob();
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    fotosBase64[key].push(base64);
                } catch (e) {
                    console.error(`Error convirtiendo foto a base64 (${key}):`, e);
                }
            }
        }
    }
    return fotosBase64;
};

export const guardarVenta = async (venta) => {
    try {
        const ventas = await obtenerVentas();

        // Usar la fecha que viene en la venta, o la fecha actual si no viene
        const fechaVenta = venta.fecha || new Date().toISOString();

        // 🆕 Generar ID único con vendedorId
        const idVenta = await generarIdVenta(venta.vendedor_id || venta.vendedor);

        // 🆕 1. Formatear productos vencidos ANTES de guardar en cola local
        const productosVencidosFormateados = (venta.vencidas || []).map(item => ({
            id: item.id,
            producto: item.nombre,
            cantidad: item.cantidad,
            motivo: item.motivo || 'No especificado'
        }));

        // 🆕 2. Obtener dispositivo_id para tracking
        const dispositivoId = await obtenerDispositivoId();

        // 🆕 3. Convertir fotoVencidas a base64 ANTES de guardar en cola local
        let fotosBase64 = null;
        if (venta.fotoVencidas) {
            fotosBase64 = await convertirFotosABase64(venta.fotoVencidas);
        }

        const nuevaVenta = {
            id: idVenta,  // 🆕 ID largo y único
            ...venta,
            productos_vencidos: productosVencidosFormateados, // 🚀 Guardar ya formateado
            foto_vencidos: fotosBase64, // 🚀 Guardar fotos en base64 para que no se pierdan al cerrar app
            dispositivo_id: dispositivoId,
            fecha: fechaVenta,
            estado: 'completada',
            sincronizada: false
        };

        // 🆕 LÓGICA DE CONSECUTIVO LOCAL
        try {
            const ultimoConsecutivoStr = await AsyncStorage.getItem('ultimo_consecutivo') || '0';
            const nuevoConsecutivo = parseInt(ultimoConsecutivoStr) + 1;
            nuevaVenta.consecutivo = nuevoConsecutivo;
            await AsyncStorage.setItem('ultimo_consecutivo', nuevoConsecutivo.toString());
        } catch (e) {
            console.error('Error generando consecutivo:', e);
            nuevaVenta.consecutivo = Date.now().toString().slice(-6);
        }

        ventas.push(nuevaVenta);
        await AsyncStorage.setItem('ventas', JSON.stringify(ventas));
        console.log('✅ Venta guardada localmente con vencidas:', nuevaVenta.id);

        const ventaBackend = normalizarVentaParaBackend({
            ...nuevaVenta, // 🚀 Usar el objeto completo ya preparado
            id_local: nuevaVenta.id,
            vendedor: venta.vendedor_id || venta.vendedor,
            cliente_nombre: venta.cliente_nombre,
            nombre_negocio: venta.cliente_negocio || '',
            total: venta.total,
            detalles: venta.productos,
            metodo_pago: venta.metodo_pago || 'EFECTIVO',
            estado: 'ACTIVA'
        }, dispositivoId);

        // 🆕 SINCRONIZAR EN SEGUNDO PLANO (no bloquea la UI)
        // Esto permite que el modal de imprimir aparezca inmediatamente
        (async () => {
            try {
                const conectado = await hayConexion();

                if (conectado) {
                    try {
                        const resultado = await enviarVentaRuta(ventaBackend);

                        if (resultado.success) {
                            console.log('✅ Venta sincronizada con servidor');

                            // Marcar como sincronizada
                            nuevaVenta.sincronizada = true;
                            const ventasActuales = await obtenerVentas();
                            const ventasActualizadas = ventasActuales.map(v => v.id === nuevaVenta.id ? { ...v, sincronizada: true } : v);
                            await AsyncStorage.setItem('ventas', JSON.stringify(ventasActualizadas));

                            // 🆕 Manejar duplicados
                            if (resultado.warning === 'DUPLICADO') {
                                console.log('⚠️ Venta ya existía en servidor (otro dispositivo)');
                            }
                        } else {
                            console.warn('⚠️ Fallo envío (API):', resultado.error);
                            await agregarAColaPendientes(ventaBackend, nuevaVenta.id);
                        }
                    } catch (err) {
                        console.warn('⚠️ Error enviando, agregando a cola:', err.message);
                        await agregarAColaPendientes(ventaBackend, nuevaVenta.id);
                    }
                } else {
                    console.log('📥 Sin conexión, agregando a cola de pendientes');
                    await agregarAColaPendientes(ventaBackend, nuevaVenta.id);
                }
            } catch (bgError) {
                console.error('❌ Error en sincronización background:', bgError);
            }
        })();

        // Retornar inmediatamente sin esperar sincronización
        return nuevaVenta;
    } catch (error) {
        console.error('Error al guardar venta:', error);
        throw error;
    }
};

/**
 * Obtiene todas las ventas
 * @returns {Promise<Array>} Lista de ventas
 */
export const obtenerVentas = async () => {
    try {
        const ventasStorage = await AsyncStorage.getItem('ventas');
        if (ventasStorage) {
            return JSON.parse(ventasStorage);
        }
        return [];
    } catch (error) {
        console.error('Error al obtener ventas:', error);
        return [];
    }
};

/**
 * 🆕 Limpia todas las ventas locales (útil para limpiar datos de prueba)
 */
export const limpiarVentasLocales = async () => {
    try {
        await AsyncStorage.removeItem('ventas');
        console.log('🗑️ Ventas locales eliminadas');
        return { success: true, message: 'Ventas eliminadas' };
    } catch (error) {
        console.error('Error limpiando ventas:', error);
        return { success: false, message: error.message };
    }
};

/**
 * Obtiene ventas por vendedor
 * @param {string} vendedor - ID del vendedor
 * @returns {Promise<Array>} Ventas del vendedor
 */
export const obtenerVentasPorVendedor = async (vendedor) => {
    const ventas = await obtenerVentas();
    return ventas.filter(v => v.vendedor === vendedor);
};

/**
 * Formatea un número como moneda colombiana
 * @param {number} valor - Valor a formatear
 * @returns {string} Valor formateado
 */
export const formatearMoneda = (valor) => {
    return `$${(valor || 0).toLocaleString('es-CO')}`;
};

export default {
    // Productos
    obtenerProductos,
    buscarProductos,
    obtenerProductoPorId,
    sincronizarProductos,

    // Clientes
    CLIENTES_PRUEBA,
    obtenerClientes,
    buscarClientes,
    guardarCliente,

    // Ventas
    calcularSubtotal,
    guardarVenta,
    obtenerVentas,
    obtenerVentasPorVendedor,
    limpiarVentasLocales,  // 🆕 Agregar

    // Cola offline
    obtenerVentasPendientes,
    sincronizarVentasPendientes,
    hayConexion,

    // Utilidades
    formatearMoneda,
};
