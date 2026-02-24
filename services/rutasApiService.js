import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = `${API_URL}/api`;

export const obtenerAuthHeaders = async (headersBase = {}) => {
    try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) {
            return {
                ...headersBase,
                Authorization: `Bearer ${token}`,
            };
        }
    } catch (error) {
        console.warn('⚠️ No se pudo leer token de autenticación:', error.message);
    }
    return headersBase;
};

export const obtenerRutasPorUsuario = async (userId) => {
    try {
        // userId puede venir como "1", "5", "ID1", "ID5". El backend espera "ID1", "ID5".
        let idVendedor = userId.toString().toUpperCase();
        if (!idVendedor.startsWith('ID')) {
            idVendedor = `ID${idVendedor}`;
        }


        const response = await fetch(`${API_BASE}/rutas/?vendedor_id=${idVendedor}`);
        const data = await response.json();

        return data;
    } catch (error) {
        console.error('Error al obtener rutas:', error);
        return [];
    }
};

export const obtenerClientesPorRutaYDia = async (rutaId, dia) => {
    try {
        const url = `${API_BASE}/clientes-ruta/?ruta=${rutaId}&dia=${dia}`;

        const response = await fetch(url);

        // Verificar si la respuesta es OK
        if (!response.ok) {
            console.error('Error HTTP:', response.status, response.statusText);
            return [];
        }

        const data = await response.json();

        return data;
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        return [];
    }
};

export const enviarVentaRuta = async (ventaData) => {
    try {
        console.log('📤 Enviando venta al backend...');
        console.log('   id_local:', ventaData.id_local);
        console.log('   dispositivo_id:', ventaData.dispositivo_id);

        // Usar FormData solo si existen archivos reales (uri file/content/http).
        // Si solo hay base64, enviar JSON: es más estable y evita errores de parseo multipart en backend.
        const hayFotos = ventaData.foto_vencidos && typeof ventaData.foto_vencidos === 'object' && Object.keys(ventaData.foto_vencidos).length > 0;
        const hayFotosArchivo = hayFotos && Object.values(ventaData.foto_vencidos).some((fotosProducto) =>
            Array.isArray(fotosProducto) &&
            fotosProducto.some((foto) => typeof foto === 'string' && !foto.startsWith('data:'))
        );

        if (hayFotosArchivo) {
            // Usar FormData para fotos
            const formData = new FormData();

            // 🆕 Campos multi-dispositivo
            if (ventaData.id_local) formData.append('id_local', ventaData.id_local);
            if (ventaData.dispositivo_id) formData.append('dispositivo_id', ventaData.dispositivo_id);

            // Campos obligatorios
            formData.append('vendedor', ventaData.vendedor_id || ventaData.vendedor);
            if (ventaData.ruta) formData.append('ruta', ventaData.ruta);
            formData.append('cliente_nombre', ventaData.cliente_nombre);
            if (ventaData.nombre_negocio) formData.append('nombre_negocio', ventaData.nombre_negocio);
            if (ventaData.cliente) formData.append('cliente', ventaData.cliente);
            formData.append('total', ventaData.total);
            formData.append('metodo_pago', ventaData.metodo_pago);
            if (ventaData.fecha) formData.append('fecha', ventaData.fecha);

            // JSON Fields
            formData.append('detalles', JSON.stringify(ventaData.detalles || []));
            formData.append('productos_vencidos', JSON.stringify(ventaData.productos_vencidos || []));

            // Fotos de evidencia
            for (const productoId in ventaData.foto_vencidos) {
                const fotosProducto = ventaData.foto_vencidos[productoId];
                if (Array.isArray(fotosProducto)) {
                    fotosProducto.forEach((fotoUri, index) => {
                        if (fotoUri.startsWith('data:')) {
                            // Si es base64, lo pusimos en JSON, no lo adjuntamos como archivo aquí
                            return;
                        }
                        formData.append(`evidencia_${productoId}_${index}`, {
                            uri: fotoUri,
                            type: 'image/jpeg',
                            name: `evidencia_${productoId}_${index}_${Date.now()}.jpg`,
                        });
                    });
                }
            }

            // 🆕 Enviar fotos base64 en su propio campo
            if (ventaData.foto_vencidos) {
                formData.append('foto_vencidos', JSON.stringify(ventaData.foto_vencidos));
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 segundos (backend necesita optimización)

            try {
                const headersAuth = await obtenerAuthHeaders();
                const response = await fetch(`${API_BASE}/ventas-ruta/`, {
                    method: 'POST',
                    headers: headersAuth,
                    body: formData,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                // 🆕 Manejo mejorado de respuestas
                if (response.status === 201) {
                    const data = await response.json();
                    console.log('✅ Venta creada en servidor:', data.id);
                    return { success: true, data };
                }

                if (response.status === 200) {
                    const data = await response.json();
                    if (data.duplicada) {
                        console.log('⚠️ Venta ya existía (duplicado):', data.id_local);
                        return { success: true, warning: 'DUPLICADO', data };
                    }
                    return { success: true, data };
                }

                if (response.status === 409) {
                    const error = await response.json();
                    console.warn('⚠️ Conflicto de sincronización:', error.error);
                    return { success: true, warning: 'CONFLICT', data: error };
                }

                const errorText = await response.text();
                console.error('❌ Error respuesta servidor:', errorText);
                return { success: false, error: `Error servidor: ${response.status} ${errorText}` };

            } catch (fetchError) {
                clearTimeout(timeoutId);
                let msj = fetchError.message;
                if (fetchError.name === 'AbortError') {
                    msj = 'Timeout: El servidor tardó demasiado';
                }
                console.warn('⚠️ Error fetch (se manejará offline):', msj);
                return { success: false, error: msj };
            }
        } else {
            // 🆕 Sin fotos: usar JSON (más rápido)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 segundos (backend necesita optimización)

            try {
                const headers = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });
                const response = await fetch(`${API_BASE}/ventas-ruta/`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(ventaData),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.status === 201) {
                    const data = await response.json();
                    console.log('✅ Venta creada en servidor:', data.id);
                    return { success: true, data };
                }

                if (response.status === 200) {
                    const data = await response.json();
                    if (data.duplicada) {
                        console.log('⚠️ Venta ya existía (duplicado):', data.id_local);
                        return { success: true, warning: 'DUPLICADO', data };
                    }
                    console.log('✅ Venta procesada:', data.id);
                    return { success: true, data };
                }

                const errorText = await response.text();
                console.warn('⚠️ HTTP rechazada:', response.status, errorText);
                return { success: false, error: `HTTP ${response.status}: ${errorText}` };
            } catch (jsonError) {
                clearTimeout(timeoutId);
                let msj = jsonError.message;
                if (jsonError.name === 'AbortError') {
                    msj = 'Timeout: El servidor tardó demasiado';
                }
                console.warn('⚠️ Error fetch JSON (se manejará offline):', msj);
                return { success: false, error: msj };
            }
        }
    } catch (error) {
        console.error('❌ Error general en enviarVentaRuta:', error);
        return { success: false, error: error.message };
    }
};

export const marcarClienteVisitado = async (ruta, orden, visitado) => {
    // TODO: Implementar persistencia de visitas en backend
    return { success: true };
};

export const limpiarTodasLasVisitas = async (ruta) => {
    // TODO: Implementar limpieza en backend
    return { success: true };
};

export const obtenerConfiguracionImpresion = async () => {
    // ⚠️ Esta función debe lanzar el error (no capturarlo) para que
    // obtenerConfigImpresionConCache() en printerService.js pueda
    // leer del caché local cuando no hay internet.
    const response = await fetch(`${API_BASE}/configuracion-impresion/`);
    if (response.ok) {
        const data = await response.json();
        // El backend devuelve una lista, tomamos el primero activo o el primero
        if (Array.isArray(data) && data.length > 0) {
            return data.find(c => c.activo) || data[0];
        } else if (data && data.id) {
            // Si devuelve un solo objeto
            return data;
        }
    }
    return null;
};

export const actualizarPedido = async (pedidoId, datos) => {
    try {
        console.log('📝 Actualizando pedido:', pedidoId, datos);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos

        const headers = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`${API_BASE}/pedidos/${pedidoId}/actualizar_app/`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(datos),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error actualizando pedido:', errorText);
            throw new Error(`Error actualizando pedido: ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Pedido actualizado correctamente');
        return result;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('⏱️ Timeout actualizando pedido');
            throw new Error('El servidor tardó demasiado en responder');
        }
        console.error('Error enviando actualización de pedido:', error);
        throw error;
    }
};

/**
 * 🆕 Editar una venta de ruta existente (PATCH)
 * Revierte stock en CargueIDx y aplica los nuevos valores.
 * @param {number|string} ventaId - ID de la venta en el backend
 * @param {object} datosActualizados - { detalles, total, metodo_pago, ... }
 */
export const editarVentaRuta = async (ventaId, datosActualizados) => {
    const headers = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch(`${API_BASE}/ventas-ruta/${ventaId}/editar/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(datosActualizados),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error al editar venta: ${response.status} - ${errorText}`);
    }

    return await response.json();
};

export default {
    obtenerRutasPorUsuario,
    obtenerClientesPorRutaYDia,
    enviarVentaRuta,
    marcarClienteVisitado,
    limpiarTodasLasVisitas,
    obtenerConfiguracionImpresion,
    actualizarPedido,
    editarVentaRuta,
};
