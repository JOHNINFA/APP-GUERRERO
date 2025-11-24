// ⚠️ SERVICIO DE VENTAS - HARDCODED PARA DESARROLLO
// Este servicio maneja la lógica de negocio de ventas con datos locales
// En el futuro se conectará al API del CRM Django

import AsyncStorage from '@react-native-async-storage/async-storage';

// ==================== DATOS HARDCODEADOS ====================

// Lista de productos con precios
export const PRODUCTOS = [
    { id: 17, nombre: 'AREPA TIPO OBLEA 500Gr', precio: 2600.0 },
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
    { id: 36, nombre: 'AREPA CON SEMILLA DE QUINUA 450Gr', precio: 4600.0 },
    { id: 37, nombre: 'AREPA DE MAIZ CON SEMILLA DE CHIA450Gr', precio: 4600.0 },
    { id: 38, nombre: 'AREPAS DE MAIZ PETO CON SEMILLA DE AJONJOLI 450GR', precio: 4600.0 },
    { id: 39, nombre: 'AREPA DE MAIZ PETO CON SEMILLAS DE LINAZA 450Gr', precio: 4600.0 },
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
    { id: 56, nombre: 'ENVUELTO DE MAIZ 500Gr', precio: 4300.0 }
];

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
 * Obtiene todos los productos
 * @returns {Array} Lista de productos
 */
export const obtenerProductos = () => {
    return PRODUCTOS;
};

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

        const nuevaVenta = {
            id: await generarIdVenta(),
            fecha: new Date().toISOString(),
            ...venta,
            estado: 'completada'
        };

        ventas.push(nuevaVenta);
        await AsyncStorage.setItem('ventas', JSON.stringify(ventas));

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

    // Utilidades
    formatearMoneda,
};
