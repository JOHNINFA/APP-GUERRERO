// ⚠️ SERVICIO DE VENTAS - CONECTADO A API
// Este servicio maneja la lógica de negocio de ventas y sincroniza productos
// ✅ INCLUYE: Cola de sincronización offline

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { enviarVentaRuta } from './rutasApiService';

// URL Base (debería venir de configuración)
const API_BASE = 'http://192.168.1.19:8000/api';

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
        const nuevasPendientes = pendientes.filter(v => v.id !== ventaId);
        await AsyncStorage.setItem(COLA_PENDIENTES_KEY, JSON.stringify(nuevasPendientes));
        console.log(`✅ Venta ${ventaId} eliminada de cola de pendientes`);
    } catch (error) {
        console.error('Error eliminando de cola:', error);
    }
};

/**
 * Intenta sincronizar todas las ventas pendientes
 */
export const sincronizarVentasPendientes = async () => {
    if (sincronizandoCola) {
        console.log('⏳ Ya hay una sincronización en curso...');
        return { sincronizadas: 0, pendientes: 0 };
    }

    sincronizandoCola = true;
    let sincronizadas = 0;

    try {
        // Verificar conexión
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
            console.log('📴 Sin conexión, no se puede sincronizar');
            sincronizandoCola = false;
            const pendientes = await obtenerVentasPendientes();
            return { sincronizadas: 0, pendientes: pendientes.length };
        }

        const pendientes = await obtenerVentasPendientes();
        console.log(`🔄 Sincronizando ${pendientes.length} ventas pendientes...`);

        for (const venta of pendientes) {
            try {
                await enviarVentaRuta(venta.data);
                await eliminarDeColaPendientes(venta.id);
                sincronizadas++;
                console.log(`✅ Venta ${venta.id} sincronizada`);
            } catch (error) {
                console.warn(`⚠️ Error sincronizando venta ${venta.id}:`, error.message);
                // Incrementar intentos
                venta.intentos++;
                if (venta.intentos >= 5) {
                    console.error(`❌ Venta ${venta.id} falló después de 5 intentos`);
                }
            }
        }

        const pendientesRestantes = await obtenerVentasPendientes();
        console.log(`📊 Sincronización completada: ${sincronizadas} exitosas, ${pendientesRestantes.length} pendientes`);
        
        return { sincronizadas, pendientes: pendientesRestantes.length };
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
            console.log('📦 Productos cargados de caché local:', productosEnMemoria.length);
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
        console.log('🔄 Sincronizando productos con servidor...');
        const response = await fetch(`${API_BASE}/productos/`);

        if (response.ok) {
            const data = await response.json();

            // Mapear al formato interno
            // Usar precio_cargue si existe, sino usar precio base
            const productosActualizados = data.map(p => ({
                id: p.id,
                nombre: p.nombre,
                precio: parseFloat(p.precio_cargue) > 0 ? parseFloat(p.precio_cargue) : parseFloat(p.precio) || 0
            }));

            if (productosActualizados.length > 0) {
                productosEnMemoria = productosActualizados;
                await AsyncStorage.setItem('productos_cache', JSON.stringify(productosEnMemoria));
                console.log('✅ Productos sincronizados con precio_cargue:', productosEnMemoria.length);
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
    return productosEnMemoria;
};

// Exportar PRODUCTOS como getter para compatibilidad
export const PRODUCTOS = productosEnMemoria;

/**
 * Busca productos por nombre
 * @param {string} query - Término de búsqueda
 * @returns {Array} Productos filtrados
 */
export const buscarProductos = (query) => {
    if (!query || query.trim() === '') return PRODUCTOS;

    const queryLower = query.toLowerCase();
    return PRODUCTOS.filter(p =>
        p.nombre.toLowerCase().includes(queryLower)
    );
};

/**
 * Obtiene un producto por ID
 * @param {number} id - ID del producto
 * @returns {Object|null} Producto encontrado o null
 */
export const obtenerProductoPorId = (id) => {
    return PRODUCTOS.find(p => p.id === id) || null;
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
 * @param {Object} cliente - Datos del cliente
 * @returns {Promise<Object>} Cliente guardado
 */
export const guardarCliente = async (cliente) => {
    try {
        const clientes = await obtenerClientes();

        // Generar ID único
        const nuevoId = `CLI-${String(clientes.length + 1).padStart(3, '0')}`;
        const nuevoCliente = {
            id: nuevoId,
            ...cliente,
            activo: true
        };

        clientes.push(nuevoCliente);
        await AsyncStorage.setItem('clientes', JSON.stringify(clientes));

        return nuevoCliente;
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
const generarIdVenta = async () => {
    try {
        const ventas = await obtenerVentas();
        const numero = ventas.length + 1;
        return `VEN-${String(numero).padStart(4, '0')}`;
    } catch (error) {
        const timestamp = Date.now();
        return `VEN-${timestamp}`;
    }
};

/**
 * Guarda una venta
 * @param {Object} venta - Datos de la venta
 * @returns {Promise<Object>} Venta guardada
 */


export const guardarVenta = async (venta) => {
    try {
        const ventas = await obtenerVentas();

        // Usar la fecha que viene en la venta, o la fecha actual si no viene
        const fechaVenta = venta.fecha || new Date().toISOString();

        const nuevaVenta = {
            id: await generarIdVenta(),
            ...venta,
            fecha: fechaVenta,
            estado: 'completada',
            sincronizada: false // Nuevo campo para tracking
        };

        ventas.push(nuevaVenta);
        await AsyncStorage.setItem('ventas', JSON.stringify(ventas));

        // Formatear productos vencidos para el backend
        const productosVencidosFormateados = (venta.vencidas || []).map(item => ({
            id: item.id,
            producto: item.nombre,
            cantidad: item.cantidad,
            motivo: item.motivo || 'No especificado'
        }));

        const ventaBackend = {
            vendedor_id: venta.vendedor_id || venta.vendedor, // Usar vendedor_id si existe
            cliente_nombre: venta.cliente_nombre,
            nombre_negocio: venta.cliente_negocio || '',
            total: venta.total,
            detalles: venta.productos,
            metodo_pago: venta.metodo_pago || 'EFECTIVO', // Usar el método de pago seleccionado
            productos_vencidos: productosVencidosFormateados,
            foto_vencidos: venta.fotoVencidas || {},
            fecha: fechaVenta // Enviar la fecha al backend
        };

        // Verificar conexión antes de enviar
        const conectado = await hayConexion();
        
        if (conectado) {
            // Intentar enviar inmediatamente
            try {
                await enviarVentaRuta(ventaBackend);
                console.log('✅ Venta sincronizada con backend');
                // Marcar como sincronizada
                nuevaVenta.sincronizada = true;
                const ventasActualizadas = ventas.map(v => v.id === nuevaVenta.id ? nuevaVenta : v);
                await AsyncStorage.setItem('ventas', JSON.stringify(ventasActualizadas));
            } catch (err) {
                console.warn('⚠️ Error enviando, agregando a cola:', err.message);
                await agregarAColaPendientes(ventaBackend, nuevaVenta.id);
            }
        } else {
            // Sin conexión, agregar a cola de pendientes
            console.log('📴 Sin conexión, venta guardada en cola de pendientes');
            await agregarAColaPendientes(ventaBackend, nuevaVenta.id);
        }

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
    PRODUCTOS,
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

    // Cola offline
    obtenerVentasPendientes,
    sincronizarVentasPendientes,
    hayConexion,

    // Utilidades
    formatearMoneda,
};
