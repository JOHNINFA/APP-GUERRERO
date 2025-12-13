import { API_URL } from '../config'; 

const API_BASE = `${API_URL}/api`;

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
        
        // Fecha de la venta (si viene, usarla; si no, el backend usa la fecha actual)
        if (ventaData.fecha) {
            formData.append('fecha', ventaData.fecha);
        }

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

export const obtenerConfiguracionImpresion = async () => {
    try {
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
    } catch (error) {
        console.error('Error obteniendo configuración de impresión:', error);
        return null;
    }
};

export default {
    obtenerRutasPorUsuario,
    obtenerClientesPorRutaYDia,
    enviarVentaRuta,
    marcarClienteVisitado,
    limpiarTodasLasVisitas,
    obtenerConfiguracionImpresion
};
