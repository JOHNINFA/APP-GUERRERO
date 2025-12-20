// Configuración centralizada de la app
// ⚠️ AJUSTAR ESTA IP SEGÚN EL ENTORNO

// Para desarrollo local:
// - Emulador Android: 'http://10.0.2.2:8000'
// - Dispositivo Físico: 'http://192.168.1.19:8000' (IP de tu PC)
// - iOS Simulator: 'http://localhost:8000'

export const API_URL = 'http://192.168.1.19:8000';

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
};
