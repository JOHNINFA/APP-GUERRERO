const API_BASE = 'http://192.168.1.19:8000/api';

export const obtenerRutasPorUsuario = async (userId) => {
    try {
        // userId viene como "5" o "ID5". El backend espera "ID5".
        const idVendedor = userId.toString().startsWith('ID') ? userId : `ID${userId}`;

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
        const response = await fetch(`${API_BASE}/clientes-ruta/?ruta=${rutaId}&dia=${dia}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        return [];
    }
};

export const enviarVentaRuta = async (ventaData) => {
    try {
        const formData = new FormData();

        // Campos obligatorios
        // CORRECCIÓN: Usar vendedor o vendedor_id (el log muestra que viene como vendedor_id)
        formData.append('vendedor', ventaData.vendedor || ventaData.vendedor_id);

        if (ventaData.ruta) formData.append('ruta', ventaData.ruta);
        formData.append('cliente_nombre', ventaData.cliente_nombre);
        if (ventaData.nombre_negocio) formData.append('nombre_negocio', ventaData.nombre_negocio);
        if (ventaData.cliente) formData.append('cliente', ventaData.cliente);
        formData.append('total', ventaData.total);
        formData.append('metodo_pago', ventaData.metodo_pago);

        // JSON Fields deben enviarse como string
        formData.append('detalles', JSON.stringify(ventaData.detalles || []));
        formData.append('productos_vencidos', JSON.stringify(ventaData.productos_vencidos || []));

        // Fotos de evidencia por producto
        // Formato: evidencia_<productoId>_<indice>
        if (ventaData.foto_vencidos && typeof ventaData.foto_vencidos === 'object') {
            for (const productoId in ventaData.foto_vencidos) {
                const fotosProducto = ventaData.foto_vencidos[productoId];
                if (Array.isArray(fotosProducto)) {
                    fotosProducto.forEach((fotoUri, index) => {
                        formData.append(`evidencia_${productoId}_${index}`, {
                            uri: fotoUri,
                            type: 'image/jpeg',
                            name: `evidencia_${productoId}_${index}_${Date.now()}.jpg`,
                        });
                    });
                }
            }
        }

        console.log('Enviando venta con FormData:', {
            ...ventaData,
            foto_vencidos: ventaData.foto_vencidos ? 'EVIDENCIAS_PRESENTES' : 'SIN_EVIDENCIAS'
        });

        const response = await fetch(`${API_BASE}/ventas-ruta/`, {
            method: 'POST',
            headers: {
                // 'Content-Type': 'multipart/form-data', // NO AGREGAR ESTO MANUALMENTE, fetch lo hace con el boundary correcto
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error respuesta servidor:', errorText);
            throw new Error(`Error del servidor: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error enviando venta:', error);
        throw error;
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

export default {
    obtenerRutasPorUsuario,
    obtenerClientesPorRutaYDia,
    enviarVentaRuta,
    marcarClienteVisitado,
    limpiarTodasLasVisitas
};
