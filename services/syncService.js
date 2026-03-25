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

// Sincronizar clientes ocasionales pendientes
export const sincronizarClientesOcasionalesPendientes = async () => {
    try {
        const pendientes = JSON.parse(await AsyncStorage.getItem('clientes_ocasionales_pendientes') || '[]');

        if (pendientes.length === 0) {
            console.log('✅ No hay clientes ocasionales pendientes de sincronizar');
            return { success: true, sincronizados: 0 };
        }

        console.log(`🔄 Sincronizando ${pendientes.length} clientes ocasionales pendientes...`);

        const sincronizados = [];
        const fallidos = [];

        for (const cliente of pendientes) {
            try {
                const response = await fetch(`${API_URL}/api/clientes-ocasionales/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vendedor: cliente.vendedor,
                        nombre: cliente.nombre,
                        telefono: cliente.telefono || '',
                        direccion: cliente.direccion || '',
                    })
                });

                if (response.ok) {
                    sincronizados.push(cliente);
                    console.log(`✅ Cliente ocasional sincronizado: ${cliente.nombre}`);
                } else {
                    cliente.intentos = (cliente.intentos || 0) + 1;
                    fallidos.push(cliente);
                    console.log(`❌ Fallo al sincronizar cliente ocasional: ${cliente.nombre}`);
                }
            } catch (error) {
                cliente.intentos = (cliente.intentos || 0) + 1;
                fallidos.push(cliente);
                console.error('❌ Error sincronizando cliente ocasional:', error);
            }
        }

        await AsyncStorage.setItem('clientes_ocasionales_pendientes', JSON.stringify(fallidos));

        console.log(`✅ Sincronización clientes ocasionales: ${sincronizados.length} exitosos, ${fallidos.length} fallidos`);

        return {
            success: true,
            sincronizados: sincronizados.length,
            fallidos: fallidos.length
        };

    } catch (error) {
        console.error('❌ Error en sincronización de clientes ocasionales:', error);
        return { success: false, error: error.message };
    }
};

// Sincronizar ventas pendientes
export const sincronizarVentasPendientes = async () => {
    try {
        const pendientes = JSON.parse(await AsyncStorage.getItem('ventas_pendientes_sync') || '[]');

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
        await AsyncStorage.setItem('ventas_pendientes_sync', JSON.stringify(fallidos));

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

// Sincronizar acciones de pedidos pendientes
export const sincronizarPedidosAccionesPendientes = async () => {
    try {
        const pendientes = JSON.parse(await AsyncStorage.getItem('pedidos_acciones_pendientes') || '[]');

        if (pendientes.length === 0) {
            console.log('✅ No hay acciones de pedidos pendientes de sincronizar');
            return { success: true, sincronizados: 0 };
        }

        console.log(`🔄 Sincronizando ${pendientes.length} acciones de pedidos pendientes...`);
        const token = await AsyncStorage.getItem('auth_token');
        const headersBase = { 'Content-Type': 'application/json' };
        if (token) {
            headersBase.Authorization = `Bearer ${token}`;
        }

        const sincronizados = [];
        const fallidos = [];

        for (const accion of pendientes) {
            try {
                let url = '';
                let body = {};

                if (accion.tipo === 'ENTREGADO') {
                    url = `${API_URL}/api/pedidos/${accion.id}/marcar_entregado/`;
                    body = { metodo_pago: accion.metodo_pago || 'EFECTIVO' };
                } else if (accion.tipo === 'NO_ENTREGADO') {
                    url = `${API_URL}/api/pedidos/${accion.id}/marcar_no_entregado/`;
                    body = { motivo: accion.motivo || 'Sin motivo especificado' };
                } else if (accion.tipo === 'ACTUALIZAR_PAGO') {
                    url = `${API_URL}/api/pedidos/${accion.id}/actualizar_app/`;
                    body = { metodo_pago: accion.metodo_pago, editado_desde_app: true };
                }

                const response = await fetch(url, {
                    method: accion.tipo === 'ACTUALIZAR_PAGO' ? 'PATCH' : 'POST',
                    headers: headersBase,
                    body: JSON.stringify(body)
                });

                if (response.ok) {
                    sincronizados.push(accion);
                    console.log(`✅ Acción de pedido sincronizada: ${accion.tipo} - ${accion.id}`);
                } else {
                    accion.intentos = (accion.intentos || 0) + 1;
                    fallidos.push(accion);
                    console.log(`❌ Fallo al sincronizar acción de pedido: ${accion.id}`);
                }
            } catch (error) {
                accion.intentos = (accion.intentos || 0) + 1;
                fallidos.push(accion);
                console.error(`❌ Error sincronizando acción de pedido:`, error);
            }
        }

        // Actualizar lista de pendientes (solo los que fallaron)
        await AsyncStorage.setItem('pedidos_acciones_pendientes', JSON.stringify(fallidos));

        console.log(`✅ Sincronización completada: ${sincronizados.length} exitosos, ${fallidos.length} fallidos`);

        return {
            success: true,
            sincronizados: sincronizados.length,
            fallidos: fallidos.length
        };

    } catch (error) {
        console.error('❌ Error en sincronización de acciones de pedidos:', error);
        return { success: false, error: error.message };
    }
};

// Sincronizar todo (clientes + clientes ocasionales + ventas + pedidos)
export const sincronizarTodo = async () => {
    console.log('🔄 Iniciando sincronización completa...');

    const resultadoClientes = await sincronizarClientesPendientes();
    const resultadoClientesOcasionales = await sincronizarClientesOcasionalesPendientes();
    const resultadoVentas = await sincronizarVentasPendientes();
    const resultadoPedidos = await sincronizarPedidosAccionesPendientes();

    return {
        clientes: resultadoClientes,
        clientesOcasionales: resultadoClientesOcasionales,
        ventas: resultadoVentas,
        pedidos: resultadoPedidos
    };
};

// Obtener cantidad de pendientes
export const obtenerCantidadPendientes = async () => {
    try {
        const clientes = JSON.parse(await AsyncStorage.getItem('clientes_pendientes') || '[]');
        const clientesOcasionales = JSON.parse(await AsyncStorage.getItem('clientes_ocasionales_pendientes') || '[]');
        const ventas = JSON.parse(await AsyncStorage.getItem('ventas_pendientes_sync') || '[]');
        const pedidos = JSON.parse(await AsyncStorage.getItem('pedidos_acciones_pendientes') || '[]');

        return {
            clientes: clientes.length,
            clientesOcasionales: clientesOcasionales.length,
            ventas: ventas.length,
            pedidos: pedidos.length,
            total: clientes.length + clientesOcasionales.length + ventas.length + pedidos.length
        };
    } catch (error) {
        console.error('Error obteniendo pendientes:', error);
        return { clientes: 0, clientesOcasionales: 0, ventas: 0, total: 0 };
    }
};
