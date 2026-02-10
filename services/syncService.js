import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

/**
 * Servicio de sincronización automática
 * Sincroniza clientes y ventas pendientes cuando hay internet
 */

// Sincronizar clientes pendientes
export const sincronizarClientesPendientes = async () => {
    try {
        const pendientes = JSON.parse(await AsyncStorage.getItem('clientes_pendientes') || '[]');
        
        if (pendientes.length === 0) {
            console.log('✅ No hay clientes pendientes de sincronizar');
            return { success: true, sincronizados: 0 };
        }

        console.log(`🔄 Sincronizando ${pendientes.length} clientes pendientes...`);
        
        const sincronizados = [];
        const fallidos = [];

        for (const cliente of pendientes) {
            try {
                const clienteRutaData = {
                    ruta: cliente.rutaId,
                    nombre_negocio: cliente.negocio || cliente.nombre,
                    nombre_contacto: cliente.nombre,
                    telefono: cliente.celular || '',
                    direccion: cliente.direccion || '',
                    tipo_negocio: cliente.tipoNegocio || '',
                    dia_visita: (cliente.diasVisita || []).join(','),
                    activo: true
                };

                const response = await fetch(`${API_URL}/api/clientes-ruta/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(clienteRutaData)
                });

                if (response.ok) {
                    sincronizados.push(cliente);
                    console.log(`✅ Cliente sincronizado: ${cliente.nombre}`);
                } else {
                    cliente.intentos = (cliente.intentos || 0) + 1;
                    fallidos.push(cliente);
                    console.log(`❌ Fallo al sincronizar: ${cliente.nombre}`);
                }
            } catch (error) {
                cliente.intentos = (cliente.intentos || 0) + 1;
                fallidos.push(cliente);
                console.error(`❌ Error sincronizando cliente:`, error);
            }
        }

        // Actualizar lista de pendientes (solo los que fallaron)
        await AsyncStorage.setItem('clientes_pendientes', JSON.stringify(fallidos));

        console.log(`✅ Sincronización completada: ${sincronizados.length} exitosos, ${fallidos.length} fallidos`);

        return {
            success: true,
            sincronizados: sincronizados.length,
            fallidos: fallidos.length
        };

    } catch (error) {
        console.error('❌ Error en sincronización de clientes:', error);
        return { success: false, error: error.message };
    }
};

// Sincronizar ventas pendientes
export const sincronizarVentasPendientes = async () => {
    try {
        const pendientes = JSON.parse(await AsyncStorage.getItem('ventas_pendientes') || '[]');
        
        if (pendientes.length === 0) {
            console.log('✅ No hay ventas pendientes de sincronizar');
            return { success: true, sincronizados: 0 };
        }

        console.log(`🔄 Sincronizando ${pendientes.length} ventas pendientes...`);
        
        const sincronizados = [];
        const fallidos = [];

        for (const venta of pendientes) {
            try {
                const response = await fetch(`${API_URL}/api/ventas/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(venta)
                });

                if (response.ok) {
                    sincronizados.push(venta);
                    console.log(`✅ Venta sincronizada: ${venta.numero_factura || venta.id}`);
                } else {
                    venta.intentos = (venta.intentos || 0) + 1;
                    fallidos.push(venta);
                    console.log(`❌ Fallo al sincronizar venta: ${venta.numero_factura || venta.id}`);
                }
            } catch (error) {
                venta.intentos = (venta.intentos || 0) + 1;
                fallidos.push(venta);
                console.error(`❌ Error sincronizando venta:`, error);
            }
        }

        // Actualizar lista de pendientes (solo los que fallaron)
        await AsyncStorage.setItem('ventas_pendientes', JSON.stringify(fallidos));

        console.log(`✅ Sincronización completada: ${sincronizados.length} exitosos, ${fallidos.length} fallidos`);

        return {
            success: true,
            sincronizados: sincronizados.length,
            fallidos: fallidos.length
        };

    } catch (error) {
        console.error('❌ Error en sincronización de ventas:', error);
        return { success: false, error: error.message };
    }
};

// Sincronizar todo (clientes + ventas)
export const sincronizarTodo = async () => {
    console.log('🔄 Iniciando sincronización completa...');
    
    const resultadoClientes = await sincronizarClientesPendientes();
    const resultadoVentas = await sincronizarVentasPendientes();

    return {
        clientes: resultadoClientes,
        ventas: resultadoVentas
    };
};

// Obtener cantidad de pendientes
export const obtenerCantidadPendientes = async () => {
    try {
        const clientes = JSON.parse(await AsyncStorage.getItem('clientes_pendientes') || '[]');
        const ventas = JSON.parse(await AsyncStorage.getItem('ventas_pendientes') || '[]');

        return {
            clientes: clientes.length,
            ventas: ventas.length,
            total: clientes.length + ventas.length
        };
    } catch (error) {
        console.error('Error obteniendo pendientes:', error);
        return { clientes: 0, ventas: 0, total: 0 };
    }
};
