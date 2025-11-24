// ⚠️ URL COMENTADA TEMPORALMENTE - NO TOCAR GOOGLE SHEETS DURANTE DESARROLLO
const GOOGLE_SHEETS_API_URL = null; // 'https://script.google.com/macros/s/AKfycbxyoyqI45IJY_tK0qc4jwvNbO7Jc95wFgQ8l2LQk0dNFJPLBSlwCY_oRCOgXHnb6f4/exec';
export const obtenerRutasPorUsuario = async (userId) => {
  try {
    const url = `${GOOGLE_SHEETS_API_URL}?action=getRutas&userId=${userId}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      return data.rutas;
    } else {
      console.error('Error al obtener rutas:', data.error);
      return [];
    }
  } catch (error) {
    console.error('Error al obtener rutas:', error);
    return [];
  }
};


export const obtenerClientesPorRutaYDia = async (nombreRuta, dia) => {
  try {
    const url = `${GOOGLE_SHEETS_API_URL}?action=getClientes&nombreRuta=${encodeURIComponent(nombreRuta)}&dia=${dia}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      return data.clientes;
    } else {
      console.error('Error al obtener clientes:', data.error);
      return [];
    }
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    return [];
  }
};


export const marcarClienteVisitado = async (nombreRuta, orden, visitado) => {
  try {
    const response = await fetch(GOOGLE_SHEETS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'marcarVisitado',
        nombreRuta: nombreRuta,
        orden: orden,
        visitado: visitado,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error al marcar visitado:', error);
    return { success: false, error: error.toString() };
  }
};


export const limpiarTodasLasVisitas = async (nombreRuta) => {
  try {
    const response = await fetch(GOOGLE_SHEETS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'limpiarVisitas',
        nombreRuta: nombreRuta,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error al limpiar visitas:', error);
    return { success: false, error: error.toString() };
  }
};

export default {
  obtenerRutasPorUsuario,
  obtenerClientesPorRutaYDia,
  marcarClienteVisitado,
  limpiarTodasLasVisitas,
};
