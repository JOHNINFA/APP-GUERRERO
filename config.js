// Configuración centralizada de la app
// ⚠️ CAMBIAR 'ENV' ANTES DE GENERAR EL APK (BUILD)

const ENV = 'PROD'; // Opciones: 'DEV' (Local) | 'PROD' (VPS/Nube)

// Direcciones IP
const LOCAL_IP = '192.168.1.19'; // Tu IP local actual
const PROD_URL = 'https://aglogistics.tech'; // Tu dominio real

export const API_URL = ENV === 'DEV'
  ? `http://${LOCAL_IP}:8000`  // DEV → tu backend local
  : PROD_URL;                   // PROD → aglogistics.tech

console.log(`🚀 App iniciada en modo: ${ENV} | API: ${API_URL}`);

// Endpoints específicos
export const ENDPOINTS = {
  GUARDAR_SUGERIDO: `${API_URL}/api/guardar-sugerido/`,
  OBTENER_CARGUE: `${API_URL}/api/obtener-cargue/`,
  ACTUALIZAR_CHECK_VENDEDOR: `${API_URL}/api/actualizar-check-vendedor/`,
  VERIFICAR_ESTADO_DIA: `${API_URL}/api/verificar-estado-dia/`,
  RENDIMIENTO_CARGUE: `${API_URL}/api/rendimiento-cargue/`,
  CERRAR_TURNO: `${API_URL}/api/cargue/cerrar-turno/`,

  // 🆕 Gestión de turnos
  TURNO_VERIFICAR: `${API_URL}/api/turno/verificar/`,
  TURNO_ABRIR: `${API_URL}/api/turno/abrir/`,
  TURNO_CERRAR: `${API_URL}/api/turno/cerrar/`,

  // 🆕 Gestión de Pedidos
  PEDIDOS_PENDIENTES: `${API_URL}/api/pedidos/pendientes_vendedor/`,
  PEDIDO_MARCAR_ENTREGADO: (id) => `${API_URL}/api/pedidos/${id}/marcar_entregado/`,
  PEDIDO_MARCAR_NO_ENTREGADO: (id) => `${API_URL}/api/pedidos/${id}/marcar_no_entregado/`,
};
