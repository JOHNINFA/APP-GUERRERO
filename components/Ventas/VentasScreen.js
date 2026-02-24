import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, FlatList, StyleSheet, Alert, SafeAreaView, StatusBar, Platform, RefreshControl, Modal, Linking, ScrollView, Keyboard, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; // 🆕 Import DatePicker
import ClienteSelector from './ClienteSelector';
import ClienteModal from './ClienteModal';
import ClienteNotaModal from './ClienteNotaModal'; // 🆕 Importar
import DevolucionesVencidas from './DevolucionesVencidas';
import ResumenVentaModal from './ResumenVentaModal';
import { ConfirmarEntregaModal } from './ConfirmarEntregaModal'; // 🆕 Importar modal
import {
    obtenerProductos,
    obtenerClientes,
    calcularSubtotal,
    guardarVenta,
    formatearMoneda,
    sincronizarProductos,
    sincronizarVentasPendientes,
    obtenerVentasPendientes,
    obtenerVentas,  // 🆕 Agregar para contar ventas del día
    limpiarVentasLocales, // 🆕 Limpiar al cerrar turno
    convertirFotosABase64 // 🆕 Helper para fotos
} from '../../services/ventasService';
import { imprimirTicket } from '../../services/printerService';
import { sincronizarPedidosAccionesPendientes } from '../../services/syncService';
import { ENDPOINTS, API_URL } from '../../config';
import { actualizarPedido, editarVentaRuta, obtenerAuthHeaders } from '../../services/rutasApiService';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🆕 Para precarga de clientes
import NetInfo from '@react-native-community/netinfo'; // 🆕 Para detectar conexión

// Días de la semana
const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const DIAS_MAP = {
    0: 'DOMINGO',
    1: 'LUNES',
    2: 'MARTES',
    3: 'MIERCOLES',
    4: 'JUEVES',
    5: 'VIERNES',
    6: 'SABADO'
};

const VentasScreen = ({ navigation, route, userId: userIdProp, vendedorNombre }) => {
    // userId puede venir de route.params o como prop directa
    const userId = route?.params?.userId || userIdProp;

    // Estado para selección de día
    const [mostrarSelectorDia, setMostrarSelectorDia] = useState(false); // 🆕 Inicia en FALSE para verificar turno primero
    const [diaSeleccionado, setDiaSeleccionado] = useState(null);
    const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());
    const [mostrarDatePicker, setMostrarDatePicker] = useState(false);
    const [verificandoTurno, setVerificandoTurno] = useState(true); // 🆕 Estado de carga inicial

    // Estados
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
    const [pedidoClienteSeleccionado, setPedidoClienteSeleccionado] = useState(null); // 🆕 Pedido del cliente actual
    const [modoEdicionPedido, setModoEdicionPedido] = useState(false); // 🆕 Controla si se permite editar cantidades del pedido
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [busquedaProductoDebounced, setBusquedaProductoDebounced] = useState('');
    const [productos, setProductos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [carrito, setCarrito] = useState({});
    const [descuento, setDescuento] = useState(0); // Restaurado
    const [preciosAlternosCargue, setPreciosAlternosCargue] = useState({}); // 🆕 Precios por listas

    // 🆕 Estados para Pedidos Asignados
    const [pedidosPendientes, setPedidosPendientes] = useState([]);
    const [modalPedidosVisible, setModalPedidosVisible] = useState(false);

    // 🆕 Estados para Novedades (No Entregado)
    const [modalNovedadVisible, setModalNovedadVisible] = useState(false);
    const [motivoNovedad, setMotivoNovedad] = useState('');
    const [ventasDelDia, setVentasDelDia] = useState([]); // 🆕 Almacenar ventas del día
    const [pedidoEnNovedad, setPedidoEnNovedad] = useState(null);
    const [pedidosEntregadosHoy, setPedidosEntregadosHoy] = useState([]); // 🆕 IDs de pedidos entregados hoy
    const [pedidosNoEntregadosHoy, setPedidosNoEntregadosHoy] = useState([]); // 🆕 Pedidos NO entregados hoy
    const [mostrarHistorialVentas, setMostrarHistorialVentas] = useState(false); // 🆕 Estado para modal historial
    const [clientesOrdenDia, setClientesOrdenDia] = useState([]); // 🆕 Orden del día para auto-avance
    const [clienteSeleccionadoEsPedido, setClienteSeleccionadoEsPedido] = useState(false);
    const [tecladoAbierto, setTecladoAbierto] = useState(false);
    const [historialReimpresion, setHistorialReimpresion] = useState([]); // 🆕 Historial unificado (backend + local fallback)
    const [cargandoHistorial, setCargandoHistorial] = useState(false);
    const [inputBuscadorEnFoco, setInputBuscadorEnFoco] = useState(false); // 🆕 Rastrear foco del buscador
    const [forzarMostrarTurno, setForzarMostrarTurno] = useState(false); // 🆕 Para ver el turno bajo demanda (peeking)
    const [inputCantidadEnFoco, setInputCantidadEnFoco] = useState(false); // 🆕 Rastrear foco específico en inputs de cantidad

    // 🆕 Estados para edición de venta desde historial
    const [ventaEnEdicion, setVentaEnEdicion] = useState(null); // venta completa que se está editando
    const [modalEdicionVisible, setModalEdicionVisible] = useState(false);
    const [carritoEdicion, setCarritoEdicion] = useState({}); // {nombreProducto: cantidad}
    const [cargandoEdicion, setCargandoEdicion] = useState(false);

    // 🆕 Ventas del backend del día actual (para badges y alertas de venta duplicada)
    const [ventasBackendDia, setVentasBackendDia] = useState([]);

    // 🆕 Estados de conectividad y banner offline
    const [hayInternet, setHayInternet] = useState(true);
    const [estadoBanner, setEstadoBanner] = useState(null); // null | 'offline' | 'sincronizando' | 'exito'
    const [ventasSincronizadas, setVentasSincronizadas] = useState(0);
    const [mostrarModalSyncRapido, setMostrarModalSyncRapido] = useState(false);
    const [textoModalSyncRapido, setTextoModalSyncRapido] = useState('');
    const bannerTimerRef = useRef(null);
    const modalSyncTimerRef = useRef(null);
    const sincronizandoAutoRef = useRef(false);
    const buscadorRef = useRef(null);
    const listaProductosRef = useRef(null);
    const indiceCantidadEnFocoRef = useRef(null);
    const carritoRef = useRef({});

    const asegurarVisibilidadInputCantidad = useCallback((index, animated = true) => {
        if (index === null || index === undefined || index < 0) return;

        requestAnimationFrame(() => {
            try {
                // Dejamos el producto enfocado en el tercio superior para evitar empujar header/acciones.
                listaProductosRef.current?.scrollToIndex({
                    index,
                    viewPosition: 0.22,
                    animated,
                });
            } catch (e) {
                // Fallback silencioso: no bloquear la edición si FlatList aún no midió el índice.
            }
        });
    }, []);

    useEffect(() => {
        carritoRef.current = carrito;
    }, [carrito]);

    useEffect(() => {
        const debounceId = setTimeout(() => {
            setBusquedaProductoDebounced(busquedaProducto);
        }, 140);

        return () => clearTimeout(debounceId);
    }, [busquedaProducto]);

    const mostrarConfirmacionSyncRapida = useCallback((enviadas) => {
        setTextoModalSyncRapido(
            enviadas === 1 ? 'Venta offline enviada' : `${enviadas} ventas offline enviadas`
        );
        setMostrarModalSyncRapido(true);

        if (modalSyncTimerRef.current) clearTimeout(modalSyncTimerRef.current);
        modalSyncTimerRef.current = setTimeout(() => {
            setMostrarModalSyncRapido(false);
        }, 1800);
    }, []);

    const sincronizarPendientesAutomatico = useCallback(async ({ forzar = false } = {}) => {
        if (!forzar && !hayInternet) return;
        if (sincronizandoAutoRef.current) return;

        try {
            const pendientesAntes = await obtenerVentasPendientes();
            setVentasPendientes(pendientesAntes.length);
            if (pendientesAntes.length === 0) return;

            sincronizandoAutoRef.current = true;
            setEstadoBanner('sincronizando');

            const resultado = await sincronizarVentasPendientes();
            const enviadas = resultado?.sincronizadas || 0;

            const pendientesDespues = await obtenerVentasPendientes();
            setVentasPendientes(pendientesDespues.length);

            if (enviadas > 0) {
                setVentasSincronizadas(enviadas);
                setEstadoBanner('exito');
                if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
                bannerTimerRef.current = setTimeout(() => setEstadoBanner(null), 3500);
                mostrarConfirmacionSyncRapida(enviadas);
            } else if (pendientesDespues.length === 0) {
                setEstadoBanner(null);
            } else {
                setEstadoBanner(null);
            }
        } catch (e) {
            if (!hayInternet) {
                setEstadoBanner('offline');
            } else {
                setEstadoBanner(null);
            }
        } finally {
            sincronizandoAutoRef.current = false;
        }
    }, [hayInternet, mostrarConfirmacionSyncRapida]);

    // 🆕 Monitor de conectividad — detecta cambios de red y sincroniza ventas pendientes
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(async (state) => {
            const conectado = state.isConnected && state.isInternetReachable !== false;
            setHayInternet(conectado);

            if (!conectado) {
                // Sin internet → mostrar banner naranja
                if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
                setEstadoBanner('offline');
            } else {
                // Volvió internet → sincronizar de inmediato
                await sincronizarPendientesAutomatico({ forzar: true });
            }
        });

        return () => {
            unsubscribe();
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
            if (modalSyncTimerRef.current) clearTimeout(modalSyncTimerRef.current);
        };
    }, [sincronizarPendientesAutomatico]);

    // Auto-sincronización cada 5s cuando hay internet (sin tocar nada)
    useEffect(() => {
        if (!hayInternet) return;
        const intervalId = setInterval(() => {
            sincronizarPendientesAutomatico();
        }, 5000);

        return () => clearInterval(intervalId);
    }, [hayInternet, sincronizarPendientesAutomatico]);

    // 🆕 Cargar Pedidos
    const verificarPedidosPendientes = async (fechaStr) => {
        try {
            // Usar fecha proporcionada o la seleccionada
            let fecha = fechaStr;
            if (!fecha && fechaSeleccionada) {
                fecha = fechaSeleccionada.toISOString().split('T')[0];
            }
            // Si no hay fecha ni userId, salir
            if (!fecha || !userId) return;

            console.log(`📦 Buscando pedidos para ${userId} en ${fecha}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos
            const headersAuth = await obtenerAuthHeaders();

            const response = await fetch(`${ENDPOINTS.PEDIDOS_PENDIENTES}?vendedor_id=${userId}&fecha=${fecha}`, {
                headers: headersAuth,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    // 🆕 Incluir: 1) Pendientes normales, 2) ANULADOS reportados desde App (No Entregados)
                    // Excluir: ANULADOS administrativos y ENTREGADOS
                    const pendientes = data.filter(p =>
                        (p.estado !== 'ENTREGADO' && p.estado !== 'ENTREGADA' && p.estado !== 'ANULADA') ||
                        (p.estado === 'ANULADA' && p.nota?.toLowerCase().includes('entregado')) // Case-insensitive
                    );

                    const entregados = data.filter(p => p.estado === 'ENTREGADO' || p.estado === 'ENTREGADA').map(p => ({
                        id: p.id,
                        destinatario: p.destinatario,
                        numero_pedido: p.numero_pedido,
                        total: parseFloat(p.total) || 0
                    }));

                    // 🆕 SOLO mostrar pedidos anulados desde App Móvil (no los del frontend)
                    const noEntregados = data.filter(p =>
                        p.estado === 'ANULADA' &&
                        p.nota?.toLowerCase().includes('entregado') // Case-insensitive
                    ).map(p => ({
                        id: p.id,
                        destinatario: p.destinatario,
                        numero_pedido: p.numero_pedido,
                        total: parseFloat(p.total) || 0
                    }));

                    setPedidosPendientes(pendientes);
                    setPedidosEntregadosHoy(entregados);
                    setPedidosNoEntregadosHoy(noEntregados);

                    console.log(`✅ ${pendientes.length} pedidos pendientes, ${entregados.length} entregados`);
                }
            }
        } catch (e) {
            console.log('Error buscando pedidos:', e);
        }
    };

    const abrirSelectorCliente = async () => {
        // Refrescar pedidos antes de abrir selector para no perder pedidos nuevos del CRM
        await verificarPedidosPendientes();
        setMostrarSelectorCliente(true);
    };

    const cargarPedidoEnCarrito = (pedido) => {
        Alert.alert(
            '🔄 Cargar Pedido',
            'Esto reemplazará los productos actuales del carrito. ¿Continuar?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Cargar',
                    onPress: () => {
                        const nuevoCarrito = {};
                        const nuevosPrecios = {}; // 🆕
                        let encontrados = 0;

                        pedido.detalles.forEach(d => {
                            // Buscar producto en catálogo local por ID o nombre
                            const prodReal = productos.find(p => p.id === d.producto || p.nombre === d.producto_nombre);

                            if (prodReal) {
                                encontrados++;

                                // 🆕 Guardar precio original del pedido para que no se pierda al editar
                                const precioUnitario = parseFloat(d.precio_unitario);
                                nuevosPrecios[prodReal.id] = precioUnitario;

                                // Construir objeto carrito con ID como clave
                                nuevoCarrito[prodReal.id] = {
                                    ...prodReal, // ID, nombre, imagen, etc
                                    cantidad: d.cantidad,
                                    precio: precioUnitario, // Usar precio del pedido
                                    subtotal: precioUnitario * d.cantidad
                                };
                            }
                        });

                        setPreciosPersonalizados(nuevosPrecios); // 🆕 Persistir precios especiales
                        setCarrito(nuevoCarrito);
                        setModalPedidosVisible(false);

                        // Intentar pre-seleccionar cliente (si existe lógica simple)
                        // Por ahora solo avisar
                        setTimeout(() => {
                            Alert.alert(
                                '✅ Pedido Cargado',
                                `Se cargaron ${encontrados} productos del pedido.\n\nPor favor selecciona el cliente y confirma la venta.`
                            );
                        }, 500);
                    }
                }
            ]
        );
    };

    // 🆕 Reportar Novedad (No entregado)
    const confirmarNovedad = async () => {
        if (!motivoNovedad.trim()) {
            Alert.alert('Atención', 'Por favor escribe el motivo de la no entrega.');
            return;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const headersAuth = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });

            const response = await fetch(ENDPOINTS.PEDIDO_MARCAR_NO_ENTREGADO(pedidoEnNovedad.id), {
                method: 'POST',
                headers: headersAuth,
                body: JSON.stringify({ motivo: motivoNovedad }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                Alert.alert('Registrado', 'La novedad ha sido reportada.');

                // 🆕 Agregar a lista local de no entregados
                setPedidosNoEntregadosHoy(prev => [...prev, {
                    id: pedidoEnNovedad.id,
                    destinatario: pedidoEnNovedad.destinatario || 'Cliente',
                    numero_pedido: pedidoEnNovedad.numero_pedido,
                    total: parseFloat(pedidoEnNovedad.total) || 0
                }]);

                // 🆕 Actualizar el pedido en la lista de pendientes para marcarlo como anulado
                // En lugar de eliminarlo, lo marcamos como ANULADA localmente
                setPedidosPendientes(prev => prev.map(p =>
                    p.id === pedidoEnNovedad.id
                        ? { ...p, estado: 'ANULADA', nota: `No entregado: ${motivoNovedad}${p.nota ? ' | ' + p.nota : ''}` }
                        : p
                ));

                // 🆕 Limpiar selección
                setPedidoClienteSeleccionado(null);

                setModalNovedadVisible(false);
                setMotivoNovedad('');

                // 🆕 UX: avanzar automáticamente al siguiente cliente
                avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });

            } else {
                Alert.alert('Error', 'No se pudo registrar la novedad.');
            }
        } catch (error) {
            console.error(error);
            // OFFLINE FALLBACK
            try {
                const accionPendiente = {
                    tipo: 'NO_ENTREGADO',
                    id: pedidoEnNovedad.id,
                    motivo: motivoNovedad,
                    fecha_accion: new Date().toISOString()
                };
                const pendientes = JSON.parse(await AsyncStorage.getItem('pedidos_acciones_pendientes') || '[]');
                pendientes.push(accionPendiente);
                await AsyncStorage.setItem('pedidos_acciones_pendientes', JSON.stringify(pendientes));

                // Actualizar UI Local
                setPedidosNoEntregadosHoy(prev => [...prev, {
                    id: pedidoEnNovedad.id,
                    destinatario: pedidoEnNovedad.destinatario || 'Cliente',
                    numero_pedido: pedidoEnNovedad.numero_pedido,
                    total: parseFloat(pedidoEnNovedad.total) || 0
                }]);

                setPedidosPendientes(prev => prev.map(p =>
                    p.id === pedidoEnNovedad.id
                        ? { ...p, estado: 'ANULADA', nota: `No entregado: ${motivoNovedad}${p.nota ? ' | ' + p.nota : ''} [OFFLINE]` }
                        : p
                ));

                setPedidoClienteSeleccionado(null);
                setModalNovedadVisible(false);
                setMotivoNovedad('');
                avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });

                Alert.alert(
                    '📴 Novedad Guardada Offline',
                    `Sin conexión. La novedad del pedido #${pedidoEnNovedad.numero_pedido} se guardó en tu celular y se sincronizará cuando regrese internet.`
                );
            } catch (e) {
                console.error("Error guardando novedad offline", e);
                Alert.alert('Error', 'No se pudo guardar la novedad ni siquiera offline.');
            }
        }
    };

    const marcarPedidoEntregado = (pedido) => {
        setPedidoParaEntregar(pedido);
        setMostrarResumenEntrega(true);
    };

    const confirmarEntregaPedido = async (tieneVencidas = false, metodoPago = 'EFECTIVO') => {
        if (!pedidoParaEntregar) return;

        // 🔥 VALIDAR: Si no tiene ID de pedido real, es una venta normal con precios especiales
        if (!pedidoParaEntregar.id || !pedidoParaEntregar.numero_pedido) {
            console.log('⚠️ No es un pedido real, procesando como venta normal');
            setMostrarResumenEntrega(false);
            // Procesar como venta normal
            confirmarVenta(fechaSeleccionada, metodoPago, {});
            return;
        }

        // 🆕 LÓGICA DE EDICIÓN: Si hay un pedido seleccionado en modo edición, usamos confirmarVenta
        if (pedidoClienteSeleccionado && ventaTemporal) {
            console.log('🔄 Confirmando pedido editado con método:', metodoPago);
            setMostrarResumenEntrega(false); // Cerrar modal pequeño

            // Llamar a confirmarVenta con el método de pago seleccionado
            // confirmarVenta usa ventaTemporal que ya fue seteado en completarVenta
            confirmarVenta(fechaSeleccionada, metodoPago, {});
            return;
        }

        // Marcar como entregado siempre (vencidas se reportan manualmente después)
        // 🆕 Ahora enviamos el metodo_pago seleccionado

        try {
            // Enviar metodo_pago en el cuerpo del POST
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const headersAuth = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });

            const response = await fetch(ENDPOINTS.PEDIDO_MARCAR_ENTREGADO(pedidoParaEntregar.id), {
                method: 'POST',
                headers: headersAuth,
                body: JSON.stringify({ metodo_pago: metodoPago }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            setMostrarResumenEntrega(false);

            if (data.success) {
                // 🆕 Agregar pedido con info del destinatario
                setPedidosEntregadosHoy(prev => [...prev, {
                    id: pedidoParaEntregar.id,
                    destinatario: pedidoParaEntregar.destinatario || clienteSeleccionado?.negocio || 'Cliente',
                    numero_pedido: pedidoParaEntregar.numero_pedido,
                    metodo_pago: metodoPago, // 🆕 Guardar localmente también
                    total: parseFloat(pedidoParaEntregar.total) || 0 // 🆕 Guardar total
                }]);

                // 🆕 Limpiar pedido del cliente para volver a botones normales
                setPedidoClienteSeleccionado(null);
                setPedidoParaEntregar(null);

                // 🆕 UX: avanzar automáticamente al siguiente cliente
                avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });


                // Recargar pedidos pendientes (con delay para dar tiempo al backend)
                const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
                setTimeout(() => {
                    verificarPedidosPendientes(fechaStr);
                }, 500); // 500ms de delay

                // Mensaje según si reportó vencidas
                if (tieneVencidas) {
                    Alert.alert(
                        '✅ Pedido Entregado',
                        `Pago: ${metodoPago}\n\nEl pedido #${pedidoParaEntregar.numero_pedido} ha sido marcado como entregado.\n\n⚠️ Recuerda reportar las vencidas usando el botón "Vencidas" del cliente.`
                    );
                } else {
                    Alert.alert('✅ Pedido Entregado', `Pago: ${metodoPago}\n\nEl pedido #${pedidoParaEntregar.numero_pedido} ha sido marcado como entregado exitosamente.`);
                }
            } else {
                Alert.alert('Error', data.message || 'No se pudo actualizar el pedido');
            }
        } catch (e) {
            setMostrarResumenEntrega(false);
            console.error(e);

            // OFFLINE FALLBACK
            try {
                const accionPendiente = {
                    tipo: 'ENTREGADO',
                    id: pedidoParaEntregar.id,
                    metodo_pago: metodoPago,
                    fecha_accion: new Date().toISOString()
                };
                const pendientes = JSON.parse(await AsyncStorage.getItem('pedidos_acciones_pendientes') || '[]');
                pendientes.push(accionPendiente);
                await AsyncStorage.setItem('pedidos_acciones_pendientes', JSON.stringify(pendientes));

                // Actualizar UI localmente
                setPedidosEntregadosHoy(prev => [...prev, {
                    id: pedidoParaEntregar.id,
                    destinatario: pedidoParaEntregar.destinatario || clienteSeleccionado?.negocio || 'Cliente',
                    numero_pedido: pedidoParaEntregar.numero_pedido,
                    metodo_pago: metodoPago,
                    total: parseFloat(pedidoParaEntregar.total) || 0
                }]);

                setPedidosPendientes(prev => prev.map(p =>
                    p.id === pedidoParaEntregar.id ? { ...p, estado: 'ENTREGADO' } : p
                ));

                setPedidoClienteSeleccionado(null);
                setPedidoParaEntregar(null);
                avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });

                if (tieneVencidas) {
                    Alert.alert(
                        '📴 Guardado Offline',
                        `Sin conexión. Pedido #${pedidoParaEntregar.numero_pedido} marcado como entregado (${metodoPago}).\nSe sincronizará al tener internet.\n\n⚠️ Reporta vencidas con el botón "Vencidas".`
                    );
                } else {
                    Alert.alert('📴 Guardado Offline', `Sin conexión. Pedido #${pedidoParaEntregar.numero_pedido} marcado como entregado (${metodoPago}) en tu celular.`);
                }
            } catch (err) {
                console.error("Error al guardar entrega offline", err);
                Alert.alert('Error', 'No se pudo actualizar el pedido. Revisa tu conexión.');
            }
        }
    };


    const [nota, setNota] = useState('');
    const [clientes, setClientes] = useState([]);

    // Estados para modales
    const [mostrarSelectorCliente, setMostrarSelectorCliente] = useState(false);
    const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
    const [mostrarVencidas, setMostrarVencidas] = useState(false);
    const [mostrarResumen, setMostrarResumen] = useState(false);
    const [mostrarResumenEntrega, setMostrarResumenEntrega] = useState(false); // 🆕 Para confirmar entrega de pedido
    const [pedidoParaEntregar, setPedidoParaEntregar] = useState(null); // 🆕 Pedido a entregar
    const [ventaTemporal, setVentaTemporal] = useState(null);

    // Estados para vencidas
    const [vencidas, setVencidas] = useState([]);
    const [fotoVencidas, setFotoVencidas] = useState(null);

    // Estado para pull to refresh
    const [refreshing, setRefreshing] = useState(false);
    const [ventasPendientes, setVentasPendientes] = useState(0);

    // 🆕 Estado para cerrar turno
    const [mostrarModalCerrarTurno, setMostrarModalCerrarTurno] = useState(false);
    const [mostrarNotaModal, setMostrarNotaModal] = useState(false); // 🆕 Estado para modal notas
    const [mostrarModalTurnoCerrado, setMostrarModalTurnoCerrado] = useState(false); // 🆕 Modal turno ya cerrado
    const [fechaTurnoCerrado, setFechaTurnoCerrado] = useState(''); // 🆕 Fecha del turno cerrado
    const [totalVentasHoy, setTotalVentasHoy] = useState(0);
    const [totalDineroHoy, setTotalDineroHoy] = useState(0);

    // 🆕 Estado para turno abierto (indicador visual)
    const [preciosPersonalizados, setPreciosPersonalizados] = useState({}); // 🆕 Precios originales de pedidos editados
    const [turnoAbierto, setTurnoAbierto] = useState(false);
    const [horaTurno, setHoraTurno] = useState(null);
    const [diferenciaPrecios, setDiferenciaPrecios] = useState(0); // 🆕 Diferencia por precios especiales

    // 🆕 Estado para stock del cargue
    const [stockCargue, setStockCargue] = useState({});

    // 🆕 useRef para evitar duplicación de ventas (reemplaza window.__guardandoVenta)
    const guardandoVentaRef = React.useRef(false);

    // Obtener día actual
    const getDiaActual = () => {
        return DIAS_MAP[new Date().getDay()];
    };

    // Seleccionar día - 🆕 Ahora abre el DatePicker
    const handleSeleccionarDia = (dia) => {
        setDiaSeleccionado(dia);
        setMostrarSelectorDia(false);
        setMostrarDatePicker(true); // 🆕 Abrir calendario
    };

    // 🆕 Confirmar fecha seleccionada
    const handleConfirmarFecha = async (event, date) => {
        setMostrarDatePicker(Platform.OS === 'ios'); // En iOS mantener visible

        if (date) {
            // 🆕 VALIDACIÓN: Verificar que el día seleccionado coincida con la fecha
            const diaRealDeFecha = DIAS_MAP[date.getDay()]; // Día real de la fecha (ej: MARTES)
            const diaSeleccionadoUpper = diaSeleccionado.toUpperCase();

            if (diaRealDeFecha !== diaSeleccionadoUpper) {
                // La fecha no coincide con el día seleccionado
                const fechaFormateada = date.toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });

                Alert.alert(
                    '⚠️ Fecha Incorrecta',
                    `La fecha seleccionada (${fechaFormateada}) es ${diaRealDeFecha}, pero elegiste ${diaSeleccionadoUpper}.\n\n¿Deseas continuar de todas formas?`,
                    [
                        {
                            text: 'Cancelar',
                            style: 'cancel',
                            onPress: () => {
                                // Volver a mostrar el selector de fecha
                                setMostrarDatePicker(true);
                            }
                        },
                        {
                            text: 'Continuar',
                            style: 'destructive',
                            onPress: () => {
                                // Continuar con la fecha incorrecta (para pruebas)
                                console.log(`⚠️ Usuario confirmó fecha incorrecta: ${diaSeleccionadoUpper} con fecha ${fechaFormateada}`);
                                procesarAperturaTurno(date);
                            }
                        }
                    ]
                );
                return;
            }

            // Si la fecha coincide, continuar normalmente
            procesarAperturaTurno(date);
        }
    };

    // 🆕 Función auxiliar para procesar la apertura del turno (extraída para reutilizar)
    const procesarAperturaTurno = async (date) => {
        setFechaSeleccionada(date);

        // Cargar inventario del cargue con la fecha seleccionada y capturar resultado
        const infoCargue = await cargarStockCargue(diaSeleccionado, date);

        // 🆕 Formatear fecha para usar en todas las llamadas
        const fechaFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        // 🆕 Cargar pedidos ANTES de verificar
        await verificarPedidosPendientes(fechaFormatted);

        // 🆕 VERIFICAR ESTADO DEL CARGUE Y PEDIDOS ANTES de abrir turno
        const tienePedidos = pedidosPendientes.length > 0;
        const hayCargue = infoCargue?.hayCargue || false;
        const estadoCargue = infoCargue?.estado || 'DESCONOCIDO';
        const totalProductos = infoCargue?.totalProductos || 0;
        const esOffline = infoCargue?.offline || false; // 🆕 Identificar si falló por falta de red
        const cargueEnDespacho = hayCargue && estadoCargue === 'DESPACHO';

        // 🚫 POLÍTICA ESTRICTA: SOLO permite abrir si hay cargue EN DESPACHO
        // 🆕 EXCEPCIÓN: Si estamos offline, permitir la apertura para poder trabajar
        if (!cargueEnDespacho && !esOffline) {
            let mensajeBloqueo = '';

            if (!hayCargue) {
                // NO HAY CARGUE
                mensajeBloqueo = `⚠️ ATENCIÓN: No hay cargue asignado para este día.\n\n` +
                    `❌ Sin stock cargado\n\n` +
                    `Para poder abrir el turno, necesitas que te asignen un cargue y que esté en estado DESPACHO.\n\n` +
                    `Contacta a tu supervisor.`;
            } else {
                // HAY CARGUE pero NO está en DESPACHO
                mensajeBloqueo = `⚠️ ATENCIÓN: El cargue NO está listo para despacho.\n\n` +
                    `📦 Estado actual: ${estadoCargue}\n` +
                    `✅ ${totalProductos} productos cargados\n\n` +
                    `Para poder abrir el turno, el cargue debe estar en estado DESPACHO.\n\n` +
                    `Espera a que tu supervisor cambie el estado a DESPACHO en el sistema.`;
            }

            Alert.alert(
                '🚫 NO PUEDES ABRIR TURNO',
                mensajeBloqueo,
                [
                    {
                        text: 'Volver al Menú',
                        onPress: () => {
                            if (navigation) {
                                navigation.goBack();
                            }
                        }
                    }
                ]
            );
            return; // 🚫 NO abrir turno
        }

        // ✅ CARGUE EN DESPACHO - Abrir turno normalmente
        await abrirTurnoConfirmado(date, fechaFormatted, infoCargue);
    };

    // 🆕 Función para abrir turno (confirmado o forzado)
    const abrirTurnoConfirmado = async (date, fechaFormatted, infoCargue) => {
        try {
            // 🆕 Llamar al backend para abrir turno (persistir estado)
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                const headersAuth = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });

                const response = await fetch(ENDPOINTS.TURNO_ABRIR, {
                    method: 'POST',
                    headers: headersAuth,
                    body: JSON.stringify({
                        vendedor_id: userId,
                        vendedor_nombre: vendedorNombre || `Vendedor ${userId}`,
                        dia: diaSeleccionado,
                        fecha: fechaFormatted,
                        dispositivo: Platform.OS
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const data = await response.json();

                if (data.error === 'TURNO_YA_CERRADO') {
                    // Turno estaba cerrado → Mostrar modal de confirmación
                    setFechaTurnoCerrado(fechaFormatted);
                    setMostrarModalTurnoCerrado(true);
                    return;
                }

                console.log('✅ Turno abierto en backend:', data);
            } catch (error) {
                console.log('⚠️ Error abriendo turno en backend:', error);
                // Continuar aunque falle (offline mode)
            }

            // Marcar turno como abierto localmente
            setTurnoAbierto(true);
            setHoraTurno(new Date());

            // 🆕 Guardar turno en memoria del dispositivo (Offline Fallback)
            try {
                await AsyncStorage.setItem(`@turno_activo_${userId}`, JSON.stringify({
                    dia: diaSeleccionado,
                    fecha: fechaFormatted,
                    hora_apertura: new Date().toISOString()
                }));
                console.log('💾 Turno guardado localmente para offline');
            } catch (e) {
                console.log('⚠️ Error guardando turno en offline:', e);
            }

            // Mensaje de "ABRIR TURNO"
            const fechaFormateada = date.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const horaActual = new Date().toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });

            // 🆕 VERIFICAR ESTADO DEL CARGUE Y PEDIDOS
            const tienePedidos = pedidosPendientes.length > 0;
            const hayCargue = infoCargue?.hayCargue || false;
            const estadoCargue = infoCargue?.estado || 'DESCONOCIDO';
            const totalProductos = infoCargue?.totalProductos || 0;

            // Construir mensaje según el estado
            let mensajeEstado = '';
            let iconoEstado = '✅';

            if (hayCargue && (estadoCargue === 'DESPACHO' || estadoCargue === 'EN_RUTA')) {
                iconoEstado = '🚚';
                mensajeEstado = `\n\n🚚 CARGUE EN ${estadoCargue}:\n✅ ${totalProductos} productos listos\n\n¡Listo para vender!`;
            } else if (hayCargue) {
                iconoEstado = '📦';
                mensajeEstado = `\n\n📦 CARGUE DETECTADO:\n✅ ${totalProductos} productos\n📋 Estado: ${estadoCargue}`;
            }

            if (tienePedidos) {
                mensajeEstado += `\n📋 ${pedidosPendientes.length} pedido(s) asignado(s)`;
            }

            Alert.alert(
                `${iconoEstado} Turno Abierto`,
                `Día: ${diaSeleccionado}\nFecha: ${fechaFormateada}\nHora: ${horaActual}${mensajeEstado}`,
                [{ text: 'OK' }]
            );

            // Si hay cliente preseleccionado desde rutas, usarlo
            if (clientePreseleccionado) {
                cargarDatosConClientePreseleccionado(clientePreseleccionado);
            } else {
                cargarDatos();
            }
            verificarPendientes();

            // 🆕 Cargar ventas del día al abrir turno
            await cargarVentasDelDia(date);

            // 🆕 PRECARGA de clientes para que el modal cargue instantáneamente
            precargarClientesEnCache();
        } catch (error) {
            console.error('Error abriendo turno:', error);
            Alert.alert('Error', 'Ocurrió un error al abrir el turno');
        }
    };

    // 🆕 Alias para abrir turno forzado
    const abrirTurnoForzado = abrirTurnoConfirmado;

    // 🆕 Función para precargar clientes en caché (en segundo plano)
    const precargarClientesEnCache = async () => {
        try {
            const cacheKeyLegacy = `clientes_cache_${userId}`;
            const cacheKeyTodos = `clientes_cache_todos_${userId}`;
            const diasSemana = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
            const url = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}`;

            console.log('🚀 Precargando clientes de ruta en segundo plano...');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                const clientesFormateados = data.map((c, index) => ({
                    id: c.id.toString(),
                    nombre: c.nombre_contacto || c.nombre_negocio,
                    negocio: c.nombre_negocio,
                    celular: c.telefono || '',
                    direccion: c.direccion || '',
                    dia_visita: c.dia_visita,
                    nota: c.nota,
                    tipo_negocio: c.tipo_negocio,
                    orden: index + 1,
                    esDeRuta: true
                }));

                // Guardar en caché (legacy + nuevo)
                const payload = JSON.stringify({
                    clientes: clientesFormateados,
                    timestamp: Date.now()
                });
                const operacionesCache = [
                    AsyncStorage.setItem(cacheKeyLegacy, payload),
                    AsyncStorage.setItem(cacheKeyTodos, payload)
                ];

                diasSemana.forEach((dia) => {
                    const clientesDia = clientesFormateados.filter((c) =>
                        c.dia_visita?.toUpperCase().includes(dia)
                    );
                    operacionesCache.push(
                        AsyncStorage.setItem(
                            `clientes_cache_dia_${userId}_${dia}`,
                            JSON.stringify({ clientes: clientesDia, timestamp: Date.now() })
                        )
                    );
                });

                await Promise.all(operacionesCache);

                console.log(`✅ Precarga completa: ${clientesFormateados.length} clientes en caché`);
            }
        } catch (error) {
            console.log('⚠️ Error en precarga de clientes:', error);
            // No es crítico, el modal puede cargar directo del servidor
        }
    };

    // Estado para cliente preseleccionado desde rutas
    const [clientePreseleccionado, setClientePreseleccionado] = useState(null);

    // 🆕 Función para cargar las ventas del día (para mostrar el conteo correcto)
    const cargarVentasDelDia = async (fecha) => {
        try {
            const todasLasVentas = await obtenerVentas();

            // Formatear fecha del día para comparar (YYYY-MM-DD)
            const fechaDia = fecha.toISOString().split('T')[0];

            // Filtrar ventas del día
            const ventasHoy = todasLasVentas.filter(venta => {
                const fechaVenta = venta.fecha.split('T')[0];
                return fechaVenta === fechaDia;
            });

            // Calcular totales
            const cantidadVentas = ventasHoy.length;
            const totalDinero = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);

            // 🆕 Calcular diferencia por precios especiales
            // Si hay precios personalizados en la venta, significa que se aplicó una lista especial
            let diferencia = 0;
            ventasHoy.forEach(venta => {
                if (venta.preciosPersonalizados && Object.keys(venta.preciosPersonalizados).length > 0) {
                    // Recalcular el total sin precios especiales
                    let totalSinEspeciales = 0;
                    venta.productos.forEach(prod => {
                        // Si el producto tiene precio personalizado, restar la diferencia
                        if (venta.preciosPersonalizados[prod.id]) {
                            const precioBase = prod.precio; // Precio original
                            const precioEspecial = venta.preciosPersonalizados[prod.id];
                            const diferenciaProd = (precioEspecial - precioBase) * prod.cantidad;
                            diferencia += diferenciaProd;
                        }
                    });
                }
            });

            setTotalVentasHoy(cantidadVentas);
            setTotalDineroHoy(totalDinero);
            setDiferenciaPrecios(diferencia); // 🆕 Guardar diferencia
            setVentasDelDia(ventasHoy); // 🆕 Guardar ventas para indicador visual
        } catch (error) {
            console.error('Error cargando ventas del día:', error);
        }
    };

    const construirHistorialLocal = () => {
        const listaLocal = Array.isArray(ventasDelDia) ? ventasDelDia : [];
        return listaLocal
            .map((venta, index) => ({
                ...venta,
                _key: `local-${venta?.id ?? index}-${venta?.fecha ?? ''}`,
                origen: venta?.origen || (venta?.es_pedido ? 'PEDIDO_FACTURADO' : 'RUTA'),
                cliente_negocio: venta?.cliente_negocio || venta?.nombre_negocio || venta?.destinatario || venta?.cliente_nombre || 'Cliente General',
                cliente_nombre: venta?.cliente_nombre || venta?.destinatario || 'Cliente General',
                detalles: Array.isArray(venta?.detalles) ? venta.detalles : (Array.isArray(venta?.productos) ? venta.productos : []),
            }))
            .sort((a, b) => new Date(b?.fecha || 0) - new Date(a?.fecha || 0));
    };

    const cargarHistorialReimpresion = async () => {
        const fallbackLocal = construirHistorialLocal();
        setHistorialReimpresion(fallbackLocal);
        setCargandoHistorial(true);

        try {
            if (!fechaSeleccionada || !userId) {
                setCargandoHistorial(false);
                return;
            }

            const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
            const vendedorIdVentas = String(userId).toUpperCase().startsWith('ID')
                ? String(userId).toUpperCase()
                : `ID${userId}`;
            const headersAuth = await obtenerAuthHeaders();

            const [respVentas, respPedidos] = await Promise.all([
                fetch(`${API_URL}/api/ventas-ruta/?vendedor_id=${vendedorIdVentas}&fecha=${fechaStr}`),
                fetch(`${ENDPOINTS.PEDIDOS_PENDIENTES}?vendedor_id=${userId}&fecha=${fechaStr}`, { headers: headersAuth })
            ]);

            const ventasData = respVentas.ok ? await respVentas.json() : [];
            const pedidosData = respPedidos.ok ? await respPedidos.json() : [];

            const ventasRuta = (Array.isArray(ventasData) ? ventasData : []).map((venta, index) => ({
                ...venta,
                _key: `ruta-${venta?.id ?? index}`,
                origen: 'RUTA',
                cliente_negocio: venta?.nombre_negocio || venta?.cliente_nombre || 'Cliente General',
                cliente_nombre: venta?.cliente_nombre || 'Cliente General',
                vendedor: venta?.vendedor_nombre || vendedorNombre || `Vendedor ${userId}`,
                detalles: Array.isArray(venta?.detalles) ? venta.detalles : [],
            }));

            const pedidosFacturados = (Array.isArray(pedidosData) ? pedidosData : [])
                .filter((pedido) => pedido?.estado === 'ENTREGADO' || pedido?.estado === 'ENTREGADA')
                .map((pedido) => ({
                    ...pedido,
                    _key: `pedido-${pedido?.id}`,
                    id: pedido?.id,
                    origen: 'PEDIDO_FACTURADO',
                    cliente_negocio: pedido?.destinatario || 'Cliente General',
                    cliente_nombre: pedido?.destinatario || 'Cliente General',
                    vendedor: vendedorNombre || `Vendedor ${userId}`,
                    fecha: pedido?.fecha_actualizacion || pedido?.fecha || (pedido?.fecha_entrega ? `${pedido.fecha_entrega}T12:00:00` : null),
                    total: parseFloat(pedido?.total) || 0,
                    metodo_pago: pedido?.metodo_pago || 'EFECTIVO',
                    detalles: Array.isArray(pedido?.detalles) ? pedido.detalles : (Array.isArray(pedido?.detalles_info) ? pedido.detalles_info : []),
                }));

            const obtenerClaveHistorial = (item) => {
                if (item?.origen === 'PEDIDO_FACTURADO') {
                    return `pedido-${item?.id ?? item?._key ?? Math.random()}`;
                }

                const idLocal = item?.id_local
                    || (typeof item?.id === 'string' && item.id.includes('-') ? item.id : null);

                if (idLocal) return `ruta-local-${idLocal}`;
                if (item?.id !== undefined && item?.id !== null) return `ruta-id-${item.id}`;
                return `ruta-key-${item?._key ?? Math.random()}`;
            };

            // Unificar backend + local: evita ocultar ventas locales pendientes
            const mapa = new Map();
            [...ventasRuta, ...pedidosFacturados, ...fallbackLocal].forEach((item) => {
                const key = obtenerClaveHistorial(item);
                const previo = mapa.get(key);

                if (!previo) {
                    mapa.set(key, item);
                    return;
                }

                // Priorizar el registro de backend para la misma venta (si existe)
                const itemEsBackend = typeof item?._key === 'string' && (item._key.startsWith('ruta-') || item._key.startsWith('pedido-'));
                const previoEsBackend = typeof previo?._key === 'string' && (previo._key.startsWith('ruta-') || previo._key.startsWith('pedido-'));

                if (itemEsBackend && !previoEsBackend) {
                    mapa.set(key, item);
                }
            });

            const combinado = Array.from(mapa.values())
                .sort((a, b) => new Date(b?.fecha || 0) - new Date(a?.fecha || 0));

            setHistorialReimpresion(combinado.length > 0 ? combinado : fallbackLocal);
        } catch (error) {
            console.log('⚠️ Historial backend no disponible, usando datos locales:', error?.message || error);
            setHistorialReimpresion(fallbackLocal);
        } finally {
            setCargandoHistorial(false);
        }
    };

    const abrirHistorialReimpresion = () => {
        setMostrarHistorialVentas(true);
        cargarHistorialReimpresion();
    };

    // ─────────────────────────────────────────────
    // 🆕 EDICIÓN DE VENTA DESDE HISTORIAL
    // ─────────────────────────────────────────────

    /** Abre el modal de edición con los productos de la venta pre-cargados */
    const abrirEdicionVenta = (venta) => {
        if (!venta?.detalles || venta.detalles.length === 0) {
            Alert.alert('Sin productos', 'Esta venta no tiene detalles para editar.');
            return;
        }

        // Pre-llenar carrito con los detalles existentes: { "Producto": cantidad }
        const carritoInicial = {};
        venta.detalles.forEach(item => {
            const nombre = item.nombre || item.producto || '';
            const cantidad = parseInt(item.cantidad || 0);
            if (nombre && cantidad > 0) {
                carritoInicial[nombre] = {
                    cantidad,
                    precio: parseFloat(item.precio || item.precio_unitario || 0),
                    subtotal: parseFloat(item.subtotal || 0),
                };
            }
        });

        setVentaEnEdicion(venta);
        setCarritoEdicion(carritoInicial);
        setModalEdicionVisible(true);
        setMostrarHistorialVentas(false); // Cerrar historial mientras se edita
    };

    /** Modifica la cantidad de un producto en el carritoEdicion */
    const cambiarCantidadEdicion = (nombreProducto, nuevaCantidad) => {
        const cantidad = parseInt(nuevaCantidad) || 0;
        setCarritoEdicion(prev => {
            const updated = { ...prev };
            if (cantidad <= 0) {
                delete updated[nombreProducto];
            } else {
                updated[nombreProducto] = {
                    ...updated[nombreProducto],
                    cantidad,
                    subtotal: (updated[nombreProducto]?.precio || 0) * cantidad,
                };
            }
            return updated;
        });
    };

    /** Confirma la edición: actualiza backend, stock local y el historial */
    const confirmarEdicionVenta = async () => {
        if (!ventaEnEdicion) return;

        const nuevosDetalles = Object.entries(carritoEdicion).map(([nombre, item]) => ({
            nombre,
            producto: nombre,
            cantidad: item.cantidad,
            precio: item.precio,
            subtotal: item.precio * item.cantidad,
        }));

        if (nuevosDetalles.length === 0) {
            Alert.alert('Sin productos', 'Agrega al menos un producto para guardar la edición.');
            return;
        }

        const nuevoTotal = nuevosDetalles.reduce((sum, i) => sum + i.subtotal, 0);

        setCargandoEdicion(true);
        try {
            // Si tiene id del backend → PATCH
            if (ventaEnEdicion.id && !String(ventaEnEdicion._key || '').startsWith('local-')) {
                await editarVentaRuta(ventaEnEdicion.id, {
                    detalles: nuevosDetalles,
                    total: nuevoTotal,
                });
            }

            // Actualizar también en la lista local ventasDelDia
            setVentasDelDia(prev =>
                prev.map(v => {
                    const mismaVenta =
                        (v.id && v.id === ventaEnEdicion.id) ||
                        (v.id_local && v.id_local === ventaEnEdicion.id_local);
                    if (mismaVenta) {
                        return { ...v, detalles: nuevosDetalles, total: nuevoTotal, editada: true };
                    }
                    return v;
                })
            );

            // Actualizar en historialReimpresion para que la card se vea en rojo
            setHistorialReimpresion(prev =>
                prev.map(v => {
                    const mismaVenta =
                        (v.id && v.id === ventaEnEdicion.id) ||
                        (v.id_local && v.id_local === ventaEnEdicion.id_local) ||
                        (v._key && v._key === ventaEnEdicion._key);
                    if (mismaVenta) {
                        return { ...v, detalles: nuevosDetalles, total: nuevoTotal, editada: true };
                    }
                    return v;
                })
            );

            // 🆕 Actualizar contadores diarios de dinero (cantidad de ventas sigue igual)
            const viejoTotal = parseFloat(ventaEnEdicion.total || 0);
            const diferenciaDinero = nuevoTotal - viejoTotal;
            setTotalDineroHoy(prev => Math.max(0, prev + diferenciaDinero));

            // 🆕 Actualizar almacenamiento permanente (AsyncStorage)
            try {
                const ventasGuardadas = await obtenerVentas();
                const ventasActualizadas = ventasGuardadas.map(v => {
                    const mismaVenta =
                        (v.id && v.id === ventaEnEdicion.id) ||
                        (v.id_local && v.id_local === ventaEnEdicion.id_local);
                    if (mismaVenta) {
                        return { ...v, detalles: nuevosDetalles, total: nuevoTotal, editada: true };
                    }
                    return v;
                });
                await AsyncStorage.setItem('ventas', JSON.stringify(ventasActualizadas));
            } catch (err) {
                console.error("Error guardando edición localmente", err);
            }

            // 🆕 Actualizar inventario local
            setStockCargue((prevStock) => {
                const nuevoStock = { ...prevStock };
                const normalizarNombre = (txt) =>
                    (txt || '')
                        .toString()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toUpperCase()
                        .replace(/\s+/g, ' ')
                        .trim();

                const resolverClaveStock = (nombreProducto) => {
                    const claveDirecta = (nombreProducto || '').toString().toUpperCase().trim();
                    if (Object.prototype.hasOwnProperty.call(nuevoStock, claveDirecta)) {
                        return claveDirecta;
                    }

                    const nombreNorm = normalizarNombre(nombreProducto);
                    const claveNormalizada = Object.keys(nuevoStock).find(
                        (k) => normalizarNombre(k) === nombreNorm
                    );
                    if (claveNormalizada) return claveNormalizada;

                    // Fallback: resolver contra catálogo local de productos
                    const prodCatalogo = productos.find((p) => {
                        const prodNorm = normalizarNombre(p?.nombre);
                        return prodNorm === nombreNorm || prodNorm.includes(nombreNorm) || nombreNorm.includes(prodNorm);
                    });

                    if (prodCatalogo?.nombre) {
                        const claveCatalogo = prodCatalogo.nombre.toUpperCase().trim();
                        if (Object.prototype.hasOwnProperty.call(nuevoStock, claveCatalogo)) {
                            return claveCatalogo;
                        }
                        const claveCatalogoNorm = Object.keys(nuevoStock).find(
                            (k) => normalizarNombre(k) === normalizarNombre(prodCatalogo.nombre)
                        );
                        if (claveCatalogoNorm) return claveCatalogoNorm;
                        return claveCatalogo;
                    }

                    return claveDirecta;
                };

                // 1. Devolver al inventario lo de la venta ORIGINAL
                const detallesViejos = ventaEnEdicion.detalles || [];
                detallesViejos.forEach((item) => {
                    const nombre = resolverClaveStock(item.nombre || item.producto || '');
                    const cant = parseInt(item.cantidad) || 0;
                    if (nombre && cant > 0) {
                        nuevoStock[nombre] = (nuevoStock[nombre] || 0) + cant;
                    }
                });

                // 2. Descontar del inventario lo de la venta NUEVA EDITADA
                nuevosDetalles.forEach((item) => {
                    const nombre = resolverClaveStock(item.nombre || item.producto || '');
                    const cant = parseInt(item.cantidad) || 0;
                    if (nombre && cant > 0) {
                        nuevoStock[nombre] = Math.max(0, (nuevoStock[nombre] || 0) - cant);
                    }
                });

                return nuevoStock;
            });

            // Cerrar el modal de edición
            setModalEdicionVisible(false);
            setVentaEnEdicion(null);
            setCarritoEdicion({});

            // Refrescar stock desde backend en segundo plano (sin exigir arrastrar para sincronizar)
            if (diaSeleccionado && fechaSeleccionada) {
                cargarStockCargue(diaSeleccionado, fechaSeleccionada).catch(() => { });
            }

            Alert.alert(
                '✅ Venta editada',
                `La venta fue actualizada correctamente.\nNuevo total: ${formatearMoneda(Math.round(nuevoTotal))}`,
                [{ text: 'Ver historial', onPress: () => abrirHistorialReimpresion() }, { text: 'OK' }]
            );
        } catch (error) {
            Alert.alert('Error al editar', `No se pudo guardar la edición:\n${error.message}`);
        } finally {
            setCargandoEdicion(false);
        }
    };

    // 🆕 ANULACIÓN DE VENTA DESDE HISTORIAL
    const anularVentaRuta = (venta) => {
        if (!venta?.id || String(venta._key || '').startsWith('local-')) {
            Alert.alert('No disponible', 'Solo se pueden anular ventas ya sincronizadas con el servidor.');
            return;
        }
        if (venta.estado === 'ANULADA') {
            Alert.alert('Ya anulada', 'Esta venta ya fue anulada.');
            return;
        }
        Alert.alert(
            '🚫 Anular Venta',
            `¿Confirmas anular la venta de "${venta.cliente_negocio || venta.cliente_nombre || 'Cliente'}"?\n\n` +
            `💰 Total: ${formatearMoneda(Math.round(parseFloat(venta.total) || 0))}\n\n` +
            `📦 Productos a devolver al cargue:\n` +
            (Array.isArray(venta.detalles) && venta.detalles.length > 0
                ? venta.detalles.map(item => {
                    const nombre = item.nombre || item.producto || 'Producto';
                    const cant = item.cantidad || 0;
                    return `  • ${cant} × ${nombre}`;
                }).join('\n')
                : '  (sin detalle de productos)') +
            `\n\n⚠️ Esta acción no se puede deshacer.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: '🚫 Anular',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 10000);
                            const headers = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });
                            const response = await fetch(
                                `${API_URL}/api/ventas-ruta/${venta.id}/anular/`,
                                { method: 'POST', headers, signal: controller.signal }
                            );
                            clearTimeout(timeoutId);
                            const data = await response.json();
                            if (response.ok && data.success) {
                                // Actualizar estado local en los tres estados de ventas
                                const marcarAnulada = v => {
                                    const misma = (v.id && v.id === venta.id) ||
                                        (v.id_local && v.id_local === venta.id_local);
                                    return misma ? { ...v, estado: 'ANULADA' } : v;
                                };
                                setHistorialReimpresion(prev => prev.map(marcarAnulada));
                                setVentasDelDia(prev => prev.map(marcarAnulada));
                                setVentasBackendDia(prev => prev.map(marcarAnulada)); // 🆕 badge header

                                // 🆕 Actualizar almacenamiento permanente (AsyncStorage)
                                try {
                                    const ventasGuardadas = await obtenerVentas();
                                    const ventasActualizadas = ventasGuardadas.map(marcarAnulada);
                                    await AsyncStorage.setItem('ventas', JSON.stringify(ventasActualizadas));
                                } catch (err) {
                                    console.error("Error guardando anulación localmente", err);
                                }

                                // 🆕 Restaurar el stock localmente sin necesidad de deslizar hacia abajo
                                if (Array.isArray(venta.detalles) && venta.detalles.length > 0) {
                                    setStockCargue(prevStock => {
                                        const nuevoStock = { ...prevStock };
                                        venta.detalles.forEach(item => {
                                            const nombreProducto = (item.nombre || item.producto || '').toUpperCase();
                                            const cantidadDevuelta = parseInt(item.cantidad) || 0;
                                            if (nombreProducto && cantidadDevuelta > 0) {
                                                const stockActual = nuevoStock[nombreProducto] || 0;
                                                nuevoStock[nombreProducto] = stockActual + cantidadDevuelta;
                                                console.log(`♻️ Stock Restituido (Anulación): ${nombreProducto} +${cantidadDevuelta}`);
                                            }
                                        });
                                        return nuevoStock;
                                    });
                                }

                                // 🆕 Descontar venta de los contadores rápidos diarios (para UX precisa)
                                setTotalVentasHoy(prev => Math.max(0, prev - 1));
                                setTotalDineroHoy(prev => Math.max(0, prev - parseFloat(venta.total || 0)));

                                Alert.alert('✅ Venta Anulada', `La venta fue anulada correctamente.\nLos productos regresaron a tu inventario.`);
                            } else {
                                Alert.alert('Error', data.error || 'No se pudo anular la venta.');
                            }
                        } catch (e) {
                            Alert.alert('Error de conexión', 'Verifica tu conexión a internet e intenta de nuevo.');
                        }
                    }
                }
            ]
        );
    };


    const verificarTurnoActivo = async () => {
        const MAX_INTENTOS = 3;
        const TIMEOUT_MS = 5000; // 5 segundos

        for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
            try {
                console.log(`🔍 Verificando turno (intento ${intento}/${MAX_INTENTOS})...`);

                // Crear AbortController para timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

                const response = await fetch(
                    `${ENDPOINTS.TURNO_VERIFICAR}?vendedor_id=${userId}`,
                    {
                        headers: await obtenerAuthHeaders(),
                        signal: controller.signal
                    }
                );

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.turno_activo) {
                    console.log('✅ Turno activo encontrado:', data);
                    // Hay turno abierto - saltar modal de selección
                    setDiaSeleccionado(data.dia);

                    // Restaurar fecha seleccionada del turno
                    const fechaTurno = new Date(data.fecha + 'T12:00:00'); // Forzar hora mediodía para evitar UTC shift
                    setFechaSeleccionada(fechaTurno);

                    // 🆕 Cargar pedidos
                    verificarPedidosPendientes(data.fecha);

                    // Parsear hora de apertura
                    if (data.hora_apertura) {
                        setHoraTurno(new Date(data.hora_apertura));
                    }

                    // 🆕 Guardar turno en memoria del dispositivo (Offline Fallback)
                    try {
                        await AsyncStorage.setItem(`@turno_activo_${userId}`, JSON.stringify({
                            dia: data.dia,
                            fecha: data.fecha,
                            hora_apertura: data.hora_apertura || new Date().toISOString()
                        }));
                        console.log('💾 Turno sincronizado localmente para offline');
                    } catch (e) {
                        console.log('⚠️ Error guardando turno en offline (sincronizando):', e);
                    }

                    // Marcar turno como abierto
                    setTurnoAbierto(true);
                    setMostrarSelectorDia(false);

                    // Cargar datos
                    await cargarStockCargue(data.dia, fechaTurno);
                    cargarDatos();
                    verificarPendientes();

                    // 🆕 Cargar ventas reales del día
                    await cargarVentasDelDia(fechaTurno);

                    return true;
                }
                return false;

            } catch (error) {
                const esTimeout = error.name === 'AbortError';
                const esSinRed = error.message.includes('Network request failed');

                console.log(`⚠️ Error verificando turno (intento ${intento}):`, esTimeout ? 'Timeout' : error.message);

                // Si es el último intento, manejar el error
                if (intento === MAX_INTENTOS) {
                    // 🆕 Buscar en AsyncStorage (Offline Fallback)
                    try {
                        const turnoGuardado = await AsyncStorage.getItem(`@turno_activo_${userId}`);
                        if (turnoGuardado) {
                            const data = JSON.parse(turnoGuardado);

                            // 🆕 Calcular antigüedad del turno en días para evitar descartar turnos válidos 
                            // que pasaron de medianoche o que seleccionaron otra fecha manualmente en el calendario
                            let esReciente = true;
                            if (data.hora_apertura) {
                                const msPasados = new Date() - new Date(data.hora_apertura);
                                const diasPasados = msPasados / (1000 * 60 * 60 * 24);
                                if (diasPasados > 3) esReciente = false;
                            }

                            // 🆕 Restaurar cualquier turno guardado localmente (hasta de 3 días atrás)
                            if (esReciente) {
                                console.log(`✅ Turno activo recuperado OFFLINE para fecha: ${data.fecha}`);

                                setDiaSeleccionado(data.dia);
                                const fechaTurno = new Date(data.fecha + 'T12:00:00');
                                setFechaSeleccionada(fechaTurno);

                                verificarPedidosPendientes(data.fecha);
                                if (data.hora_apertura) setHoraTurno(new Date(data.hora_apertura));

                                setTurnoAbierto(true);
                                setMostrarSelectorDia(false);

                                await cargarStockCargue(data.dia, fechaTurno);
                                cargarDatos();
                                verificarPendientes();
                                await cargarVentasDelDia(fechaTurno);

                                // Mostrar confirmación visual de que se entró offline
                                Alert.alert(
                                    '📴 Turno Restaurado Sin Conexión',
                                    `Has entrado en modo offline con el turno del ${data.fecha}. Las ventas se conservarán en el celular y se enviarán al reconectar.`,
                                    [{ text: 'ENTENDIDO' }]
                                );

                                return true;
                            } else {
                                console.log(`🗑️ Turno offline muy viejo o inválido descartado (${data.fecha})`);
                                await AsyncStorage.removeItem(`@turno_activo_${userId}`);
                            }
                        }
                    } catch (e) {
                        console.log('⚠️ Error leyendo turno offline:', e);
                    }

                    // Si no había turno offline o no es de hoy, pedir al usuario
                    // Mostrar alerta al usuario
                    Alert.alert(
                        '⚠️ Sin Conexión',
                        'No se pudo verificar el turno activo.\n\n' +
                        '¿Deseas continuar en modo offline?\n\n' +
                        '(Podrás abrir un turno nuevo, pero no se verificará si ya hay uno abierto)',
                        [
                            {
                                text: 'Volver',
                                style: 'cancel',
                                onPress: () => {
                                    if (navigation) {
                                        navigation.goBack();
                                    }
                                }
                            },
                            {
                                text: 'Continuar Offline',
                                onPress: () => {
                                    console.log('📴 Modo offline activado');
                                    setMostrarSelectorDia(true);
                                }
                            }
                        ]
                    );
                    return false;
                }

                // Esperar antes del siguiente intento (backoff exponencial)
                await new Promise(resolve => setTimeout(resolve, 1000 * intento));
            }
        }

        return false;
    };

    // Cargar datos iniciales solo cuando se selecciona un día
    useEffect(() => {
        // 🆕 Verificar primero si hay turno activo
        const inicializar = async () => {
            // Si viene de rutas con cliente preseleccionado
            if (route?.params?.fromRuta && route?.params?.clientePreseleccionado) {
                setClientePreseleccionado(route.params.clientePreseleccionado);
            }

            // Verificar turno activo
            setVerificandoTurno(true);
            const hayTurno = await verificarTurnoActivo();
            setVerificandoTurno(false);

            if (!hayTurno) {
                // No hay turno, mostrar selector de día
                setMostrarSelectorDia(true);
            };
        };

        inicializar();
    }, [route.params?.clientePreseleccionado]); // Ejecutar cuando cambie el parámetro de navegación

    // 🆕 Efecto para aplicar precios automáticos si el cliente tiene lista
    useEffect(() => {
        // 🆕 MEJORADO: Aplicar precios de lista SIEMPRE que haya cliente con lista y precios alternos disponibles
        // Esto asegura que cuando cambias de cliente, se apliquen los precios correctos
        if (
            clienteSeleccionado &&
            Object.keys(preciosAlternosCargue).length > 0
        ) {
            const listaCliente = clienteSeleccionado.lista_precio_nombre || clienteSeleccionado.tipo_lista_precio;

            if (listaCliente) {
                const nuevosPrecios = {};

                // Iterar PRODUCTOS (catálogo cargado) y buscar precio en lista
                productos.forEach(prod => {
                    const nombreProd = prod.nombre.toUpperCase();
                    let preciosAlt = preciosAlternosCargue[nombreProd];

                    if (!preciosAlt) {
                        const key = Object.keys(preciosAlternosCargue).find(k => k.includes(nombreProd) || nombreProd.includes(k));
                        if (key) preciosAlt = preciosAlternosCargue[key];
                    }

                    if (preciosAlt && preciosAlt[listaCliente]) {
                        nuevosPrecios[prod.id] = preciosAlt[listaCliente];
                    }
                });

                if (Object.keys(nuevosPrecios).length > 0) {
                    setPreciosPersonalizados(nuevosPrecios);
                } else {
                    // Si no hay precios para esta lista, limpiar precios personalizados
                    setPreciosPersonalizados({});
                }
            } else {
                // Si el cliente no tiene lista, limpiar precios personalizados
                setPreciosPersonalizados({});
            }
        }
    }, [clienteSeleccionado, preciosAlternosCargue, productos]); // Dependencias clave

    // 🆕 Cargar datos iniciales con cliente preseleccionado
    const cargarDatosConClientePreseleccionado = async (clientePre) => {
        // Cargar productos filtrados por disponible_app_ventas
        const productosData = obtenerProductos();
        const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
        setProductos(productosFiltrados);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Buscar si el cliente existe en la lista o crear uno temporal
        const clienteExistente = clientesData.find(c =>
            c.nombre_negocio === clientePre.nombre_negocio ||
            c.id === clientePre.id
        );

        if (clienteExistente) {
            // 🆕 Combinar datos: priorizar lista_precio_nombre de la ruta si existe
            setClienteSeleccionado({
                ...clienteExistente,
                lista_precio_nombre: clientePre.lista_precio_nombre || clienteExistente.lista_precio_nombre,
                tipo_lista_precio: clienteExistente.tipo_lista_precio || clientePre.lista_precio_nombre
            });
        } else {
            // Usar el cliente de la ruta directamente
            setClienteSeleccionado({
                id: clientePre.id,
                nombre: clientePre.nombre_contacto || clientePre.nombre_negocio,
                nombre_negocio: clientePre.nombre_negocio,
                direccion: clientePre.direccion,
                telefono: clientePre.telefono,
                // 🆕 Incluir lista de precios
                lista_precio_nombre: clientePre.lista_precio_nombre,
                tipo_lista_precio: clientePre.lista_precio_nombre
            });
        }

        verificarPendientes();
    };

    const cargarDatos = async () => {
        // Cargar productos filtrados por disponible_app_ventas
        const productosData = obtenerProductos();
        const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
        setProductos(productosFiltrados);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // NO seleccionar cliente por defecto - Obligar al usuario a elegir
        setClienteSeleccionado(null);
    };

    // 🆕 Cargar stock del cargue según el día y fecha
    const cargarStockCargue = async (dia, fecha) => {
        try {
            // Formatear fecha a YYYY-MM-DD
            let fechaFormateada;
            if (fecha instanceof Date) {
                const year = fecha.getFullYear();
                const month = String(fecha.getMonth() + 1).padStart(2, '0');
                const day = String(fecha.getDate()).padStart(2, '0');
                fechaFormateada = `${year}-${month}-${day}`;
            } else {
                fechaFormateada = fecha;
            }

            // 🆕 Agregar timeout de 30 segundos
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            try {
                // Llamar al endpoint de obtener cargue
                const response = await fetch(
                    `${ENDPOINTS.OBTENER_CARGUE}?vendedor_id=${userId}&dia=${dia}&fecha=${fechaFormateada}`,
                    { signal: controller.signal }
                );
                clearTimeout(timeoutId);

                const data = await response.json();

                if (data && Object.keys(data).length > 0) {
                    // Crear objeto con stock por producto
                    const stockPorProducto = {};
                    const preciosAlternos = {}; // 🆕
                    let totalProductos = 0;
                    let estadoCargue = 'DESCONOCIDO';

                    Object.keys(data).forEach(nombreProducto => {
                        const item = data[nombreProducto];
                        // Calcular stock disponible (total ya viene calculado desde backend)
                        const stockDisponible = parseInt(item.quantity) || 0;
                        stockPorProducto[nombreProducto.toUpperCase()] = stockDisponible;
                        totalProductos++;

                        // Capturar estado del cargue (todos deberían tener el mismo estado)
                        if (item.estado) {
                            estadoCargue = item.estado;
                        }

                        // 🆕 Capturar precios alternos
                        if (item.precios_alternos) {
                            preciosAlternos[nombreProducto.toUpperCase()] = item.precios_alternos;
                        }
                    });

                    setStockCargue(stockPorProducto);
                    setPreciosAlternosCargue(preciosAlternos); // 🆕 Guardar precios alternos
                    console.log('📦 Stock cargado:', Object.keys(stockPorProducto).length, 'productos');

                    if (Object.keys(preciosAlternos).length > 0) {
                        // 🆕 No mostrar alert, solo guardar silenciosamente
                    }

                    // 🆕 Retornar información del cargue
                    return {
                        hayCargue: true,
                        totalProductos,
                        estado: estadoCargue
                    };
                } else {
                    console.log('⚠️ No hay cargue para esta fecha');
                    setStockCargue({});
                    return {
                        hayCargue: false,
                        totalProductos: 0,
                        estado: null
                    };
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                const isNetworkError = fetchError.message.includes('Network') || fetchError.message.includes('fetch');
                if (fetchError.name === 'AbortError') {
                    console.error('⏱️ Timeout cargando stock');
                } else {
                    console.error('❌ Error cargando stock:', fetchError.message);
                }
                setStockCargue({});
                return { hayCargue: false, totalProductos: 0, estado: null, offline: isNetworkError };
            }
        } catch (error) {
            console.error('❌ Error general cargando stock:', error);
            setStockCargue({});
            return { hayCargue: false, totalProductos: 0, estado: null, offline: true };
        }
    };

    // Verificar ventas pendientes de sincronizar
    const verificarPendientes = async () => {
        const pendientes = await obtenerVentasPendientes();
        setVentasPendientes(pendientes.length);
    };

    // Función para sincronizar al arrastrar hacia abajo (con timeout y manejo de errores)
    const onRefresh = async () => {
        setRefreshing(true);
        const TIMEOUT_MS = 10000; // 10 segundos timeout

        try {
            // Helper para ejecutar con timeout
            const conTimeout = (promesa, nombre) => {
                return Promise.race([
                    promesa,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Timeout: ${nombre}`)), TIMEOUT_MS)
                    )
                ]);
            };

            const resultados = {
                ventas: null,
                productos: false,
                stock: false,
                pedidos: false,
                errores: []
            };

            // 1. Sincronizar ventas pendientes (con timeout)
            try {
                resultados.ventas = await conTimeout(
                    sincronizarVentasPendientes(),
                    'Sincronización de ventas'
                );
            } catch (error) {
                console.log('⚠️ Error sincronizando ventas:', error.message);
                resultados.errores.push('Ventas pendientes');
            }

            // 2. Sincronizar acciones de pedidos (con timeout)
            try {
                await conTimeout(
                    sincronizarPedidosAccionesPendientes(),
                    'Sincronización de pedidos'
                );
            } catch (error) {
                console.log('⚠️ Error sincronizando pedidos:', error.message);
                resultados.errores.push('Pedidos pendientes');
            }

            // 3. Sincronizar productos (con timeout)
            try {
                await conTimeout(
                    sincronizarProductos(),
                    'Sincronización de productos'
                );

                // 3. Recargar productos actualizados filtrados por disponible_app_ventas
                const productosData = obtenerProductos();
                const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
                setProductos(productosFiltrados);
                resultados.productos = true;
            } catch (error) {
                console.log('⚠️ Error sincronizando productos:', error.message);
                resultados.errores.push('Productos y precios');
            }

            // 4. Recargar stock del cargue (con timeout)
            try {
                await conTimeout(
                    cargarStockCargue(diaSeleccionado, fechaSeleccionada),
                    'Carga de stock'
                );
                resultados.stock = true;
            } catch (error) {
                console.log('⚠️ Error cargando stock:', error.message);
                resultados.errores.push('Stock del cargue');
            }

            // 5. Recargar pedidos pendientes (con timeout)
            try {
                const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
                await conTimeout(
                    verificarPedidosPendientes(fechaStr),
                    'Verificación de pedidos'
                );
                resultados.pedidos = true;
            } catch (error) {
                console.log('⚠️ Error verificando pedidos:', error.message);
                resultados.errores.push('Pedidos pendientes');
            }

            // 6. Actualizar contador de pendientes (sin timeout crítico)
            try {
                await verificarPendientes();
            } catch (error) {
                console.log('⚠️ Error actualizando contador:', error.message);
            }

            // Construir mensaje de resultado
            let mensaje = '';
            const exitosos = [];

            if (resultados.productos) exitosos.push('✅ Productos y precios');
            if (resultados.stock) exitosos.push('✅ Stock del cargue');
            if (resultados.pedidos) exitosos.push('✅ Pedidos');

            if (resultados.ventas) {
                if (resultados.ventas.sincronizadas > 0) {
                    exitosos.push(`✅ ${resultados.ventas.sincronizadas} ventas sincronizadas`);
                }
                if (resultados.ventas.pendientes > 0) {
                    exitosos.push(`⏳ ${resultados.ventas.pendientes} ventas pendientes`);
                }
            }

            if (exitosos.length > 0) {
                mensaje = exitosos.join('\n');
            }

            if (resultados.errores.length > 0) {
                mensaje += (mensaje ? '\n\n' : '') + '⚠️ No se pudo actualizar:\n' + resultados.errores.join(', ');
            }

            if (!mensaje) {
                mensaje = '⚠️ No se pudo conectar con el servidor';
            }

            Alert.alert(
                resultados.errores.length === 0 ? 'Actualizado' : 'Actualización Parcial',
                mensaje
            );

        } catch (error) {
            console.error('❌ Error general sincronizando:', error);
            Alert.alert(
                '⚠️ Error de Conexión',
                'No se pudo actualizar. Verifica tu conexión a internet.\n\n' +
                'Puedes seguir trabajando offline, las ventas se sincronizarán automáticamente cuando haya conexión.'
            );
        } finally {
            setRefreshing(false);
        }
    };

    const normalizarTexto = useCallback((txt) => (
        (txt || '')
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim()
    ), []);

    const productosPorId = useMemo(() => {
        const mapa = new Map();
        productos.forEach((p) => {
            const idNumerico = Number(p.id);
            mapa.set(idNumerico, p);
        });
        return mapa;
    }, [productos]);

    const productosIndexBusqueda = useMemo(() => (
        productos.map((p) => ({
            producto: p,
            nombreNormalizado: normalizarTexto(p?.nombre),
        }))
    ), [productos, normalizarTexto]);

    // Filtrar productos según búsqueda (usa el estado local para funcionar igual online/offline)
    const productosFiltrados = useMemo(() => {
        const query = normalizarTexto(busquedaProductoDebounced);
        if (!query) return productos;

        return productosIndexBusqueda
            .filter((entry) => entry.nombreNormalizado.includes(query))
            .map((entry) => entry.producto);
    }, [busquedaProductoDebounced, productos, productosIndexBusqueda, normalizarTexto]);

    const preciosPorProductoId = useMemo(() => {
        const mapa = {};
        const listaCliente = clienteSeleccionado?.lista_precio_nombre || clienteSeleccionado?.tipo_lista_precio;
        const keysPreciosAlternos = Object.keys(preciosAlternosCargue || {});

        productos.forEach((producto) => {
            const idNumerico = Number(producto.id);

            if (preciosPersonalizados[idNumerico] !== undefined) {
                mapa[idNumerico] = preciosPersonalizados[idNumerico];
                return;
            }

            let precioFinal = producto.precio;
            if (listaCliente) {
                const nombreProd = (producto.nombre || '').toUpperCase();
                let preciosAlt = preciosAlternosCargue[nombreProd];

                if (!preciosAlt) {
                    const key = keysPreciosAlternos.find((k) => k.includes(nombreProd) || nombreProd.includes(k));
                    if (key) preciosAlt = preciosAlternosCargue[key];
                }

                if (preciosAlt?.[listaCliente] !== undefined) {
                    precioFinal = preciosAlt[listaCliente];
                }
            }

            mapa[idNumerico] = precioFinal;
        });

        return mapa;
    }, [productos, preciosPersonalizados, clienteSeleccionado, preciosAlternosCargue]);

    // Obtener cantidad de un producto en el carrito - 🚀 Optimizado con useCallback
    const getCantidad = useCallback((productoId) => {
        return carrito[productoId] || 0;
    }, [carrito]);

    // Actualizar cantidad de un producto - 🚀 Optimizado con useCallback
    const actualizarCantidad = useCallback((productoId, nuevaCantidad) => {
        if (nuevaCantidad < 0) return;

        const idNumerico = Number(productoId);
        const producto = productosPorId.get(idNumerico);
        const cantidadActual = carritoRef.current[idNumerico] || 0;

        // 🆕 Validación de Stock
        if (producto && !pedidoClienteSeleccionado) {
            const nombreNormalizado = (producto.nombre || '').trim().toUpperCase();
            const stockDisponible = stockCargue[nombreNormalizado] !== undefined ? stockCargue[nombreNormalizado] : 0;

            if (nuevaCantidad > cantidadActual && nuevaCantidad > stockDisponible) {
                Alert.alert(
                    '⚠️ Sin Stock suficiente',
                    `Solo tienes ${stockDisponible} unidades de ${producto.nombre} en tu carga.\n\nNo puedes vender más de lo que llevas físicamente.`
                );
                return; // ⛔ Evitar actualización
            }
        }

        setCarrito((prev) => {
            const nuevoCarrito = { ...prev };
            if (nuevaCantidad === 0) {
                delete nuevoCarrito[idNumerico];
            } else {
                nuevoCarrito[idNumerico] = nuevaCantidad;
            }
            return nuevoCarrito;
        });
    }, [productosPorId, stockCargue, pedidoClienteSeleccionado]);

    // 🆕 Helper para obtener el precio real de un producto - 🚀 Optimizado con useCallback
    const getPrecioProducto = useCallback((producto) => {
        return preciosPorProductoId[Number(producto.id)] ?? producto.precio;
    }, [preciosPorProductoId]);

    // Calcular totales - 🚀 Optimizado con useMemo
    const { subtotal, total } = useMemo(() => {
        let subtotalVal = 0;

        Object.entries(carrito).forEach(([idStr, cantidad]) => {
            if (!cantidad || cantidad <= 0) return;

            const producto = productosPorId.get(Number(idStr));
            if (!producto) return;

            const precioReal = getPrecioProducto(producto);
            subtotalVal += precioReal * cantidad;
        });

        const totalVal = subtotalVal - descuento;

        return { subtotal: subtotalVal, total: totalVal };
    }, [carrito, productosPorId, getPrecioProducto, descuento]);

    // Completar venta
    const completarVenta = async () => {
        // Validar que haya productos en el carrito O vencidas
        const productosEnCarrito = Object.keys(carrito).filter(id => carrito[id] > 0);

        if (productosEnCarrito.length === 0 && vencidas.length === 0) {
            Alert.alert('Error', 'Debe agregar al menos un producto o reportar vencidas');
            return;
        }

        // Validar cliente
        if (!clienteSeleccionado) {
            Alert.alert('Error', 'Debe seleccionar un cliente');
            return;
        }

        // 🆕 Función interna para procesar la venta después de validaciones
        const procesarVenta = () => {
            // Preparar datos de la venta
            const productosVenta = productosEnCarrito.map(idStr => {
                const id = parseInt(idStr);
                const producto = productosPorId.get(id);
                if (!producto) return null;
                const cantidad = carrito[id];

                return {
                    id: producto.id,
                    nombre: producto.nombre,
                    // 🆕 Usar precio personalizado si existe
                    precio: preciosPersonalizados[id] !== undefined ? preciosPersonalizados[id] : producto.precio,
                    cantidad: cantidad,
                    subtotal: (preciosPersonalizados[id] !== undefined ? preciosPersonalizados[id] : producto.precio) * cantidad
                };
            }).filter(Boolean);

            const venta = {
                cliente_id: clienteSeleccionado.id,
                cliente_nombre: clienteSeleccionado.nombre,
                cliente_negocio: clienteSeleccionado.negocio, // Asegurar que se pase el negocio
                cliente_celular: clienteSeleccionado.celular || '',
                vendedor: vendedorNombre || userId, // Usar nombre del vendedor para el ticket
                vendedor_id: userId, // ID para el backend
                productos: productosVenta,
                subtotal: subtotal,
                descuento: descuento,
                total: total,
                nota: nota,
                vencidas: vencidas,
                fotoVencidas: fotoVencidas
            };

            setVentaTemporal(venta);

            // 🆕 Validar si hay stock suficiente para cambiar vencidas
            const advertenciasVencidas = [];
            if (vencidas && vencidas.length > 0) {
                vencidas.forEach(vencida => {
                    const nombreProducto = vencida.nombre.toUpperCase();
                    const stockActual = stockCargue[nombreProducto] || 0;
                    const cantidadVendida = productosVenta.find(p => p.nombre.toUpperCase() === nombreProducto)?.cantidad || 0;
                    const stockDisponible = stockActual - cantidadVendida;

                    if (vencida.cantidad > stockDisponible) {
                        if (stockDisponible <= 0) {
                            advertenciasVencidas.push(`⚠️ ${vencida.nombre}: No tienes stock para cambiar ${vencida.cantidad} vencidas`);
                        } else {
                            advertenciasVencidas.push(`⚠️ ${vencida.nombre}: Solo tienes ${stockDisponible} para cambiar ${vencida.cantidad} vencidas`);
                        }
                    }
                });
            }

            // Si hay advertencias, mostrar alerta pero permitir continuar
            // Función auxiliar para abrir el modal correcto
            const abrirModalConfirmacion = () => {
                if (pedidoClienteSeleccionado) {
                    // Si es Edición de Pedido -> Modal Pequeño (ConfirmarEntregaModal)

                    // 🆕 Construir detalles actualizados basados en el carrito para mostrar en el modal
                    const detallesVisuales = productosVenta.map(p => ({
                        producto_nombre: p.nombre,
                        cantidad: p.cantidad,
                        precio_unitario: p.precio,
                        subtotal: p.subtotal
                    }));

                    setPedidoParaEntregar({
                        ...pedidoClienteSeleccionado,
                        total: venta.total, // Usar el NUEVO total calculado
                        numero_pedido: pedidoClienteSeleccionado.numero_pedido,
                        detalles: detallesVisuales // 🆕 Detalles actualizados
                    });
                    setMostrarResumenEntrega(true);
                } else {
                    // Si es Venta Normal -> Modal Grande (ResumenVentaModal)
                    setMostrarResumen(true);
                }
            };

            if (advertenciasVencidas.length > 0) {
                Alert.alert(
                    '⚠️ Advertencia de Stock',
                    advertenciasVencidas.join('\n') + '\n\n¿Deseas continuar de todas formas?',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Continuar', onPress: abrirModalConfirmacion }
                    ]
                );
            } else {
                abrirModalConfirmacion();
            }
        };

        // 🆕 DETECCIÓN DE VENTA REPETIDA — combina ventas locales + backend
        const norm = (t) => t ? t.toString().toLowerCase().trim() : '';
        const cNegocio = norm(clienteSeleccionado.negocio);
        const cNombre = norm(clienteSeleccionado.nombre);

        const anuladoEnBackend = ventasBackendDia.some(b =>
            b.estado === 'ANULADA' &&
            ((b.nombre_negocio && norm(b.nombre_negocio) === cNegocio) ||
                (b.cliente_nombre && norm(b.cliente_nombre) === cNombre))
        );

        const ventaPrevia = !anuladoEnBackend && (
            ventasDelDia.find(v => v.estado !== 'ANULADA' && v.cliente_id == clienteSeleccionado.id) ||
            ventasBackendDia.find(v =>
                v.estado !== 'ANULADA' && (
                    (norm(v.nombre_negocio) && norm(v.nombre_negocio) === cNegocio) ||
                    (norm(v.cliente_nombre) && norm(v.cliente_nombre) === cNombre)
                )
            )
        );

        // Si ya vendió y NO estamos editando un pedido específico (flujo normal)
        if (ventaPrevia && !pedidoClienteSeleccionado) {
            Alert.alert(
                '⚠️ Cliente Ya Atendido',
                `Ya realizaste una venta a ${clienteSeleccionado.negocio || clienteSeleccionado.nombre} hoy.\n\n¿Deseas registrar otra venta?`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Sí, Continuar', onPress: procesarVenta }
                ]
            );
            return;
        }

        // Si no hay problema, procesar directamente
        procesarVenta();
    };

    // Confirmar y guardar venta
    const confirmarVenta = async (fechaSeleccionada, metodoPago, opcionesEnvio) => {

        if (!ventaTemporal) {
            console.log('❌ No hay ventaTemporal');
            return;
        }

        // 🆕 Evitar duplicación - Si ya está guardando, salir
        if (guardandoVentaRef.current) {
            console.log('⚠️ Ya se está guardando una venta, ignorando...');
            return;
        }

        // Agregar la fecha y método de pago a la venta
        // 🔧 Formatear fecha en zona horaria local para evitar cambios de día
        let fechaFormateada;
        if (fechaSeleccionada) {
            const year = fechaSeleccionada.getFullYear();
            const month = String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
            const day = String(fechaSeleccionada.getDate()).padStart(2, '0');
            const hours = String(fechaSeleccionada.getHours()).padStart(2, '0');
            const minutes = String(fechaSeleccionada.getMinutes()).padStart(2, '0');
            const seconds = String(fechaSeleccionada.getSeconds()).padStart(2, '0');
            fechaFormateada = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        } else {
            fechaFormateada = new Date().toISOString();
        }

        const ventaConDatos = {
            ...ventaTemporal,
            fecha: fechaFormateada,
            metodo_pago: metodoPago || 'EFECTIVO',
            preciosPersonalizados: preciosPersonalizados // 🆕 Guardar precios especiales para auditoría
        };



        try {
            // 🆕 Marcar que está guardando
            guardandoVentaRef.current = true;
            console.log('💾 Guardando venta...');

            let ventaGuardada;

            if (pedidoClienteSeleccionado) {
                // 📦 LÓGICA DE ACTUALIZACIÓN DE PEDIDO Y NOVEDADES
                const novedades = [];
                // 1. Reconstruir detalles nuevos basados en el carrito (lo que realmente se entrega)
                Object.keys(carrito).forEach(id => {
                    const prod = productos.find(p => p.id == parseInt(id));
                    if (prod && carrito[id] > 0) {
                        detallesNuevos.push({
                            producto: prod.id,
                            cantidad: carrito[id],
                            precio_unitario: prod.precio
                        });
                    }
                });

                // 2. Calcular Novedades (Diferencias vs Original)
                if (pedidoClienteSeleccionado.detalles) {
                    pedidoClienteSeleccionado.detalles.forEach(detalleOriginal => {
                        const id = detalleOriginal.producto;
                        const cantidadNueva = carrito[id] || 0;

                        if (cantidadNueva < detalleOriginal.cantidad) {
                            novedades.push({
                                producto: detalleOriginal.producto_nombre,
                                cantidad: detalleOriginal.cantidad - cantidadNueva,
                                motivo: 'Devolución en entrega'
                            });
                        }
                    });
                }

                // 🆕 2.5 Formatear Vencidas y convertir fotos (si existen)
                const productosVencidosFormateados = (ventaConDatos.vencidas || []).map(item => ({
                    id: item.id,
                    producto: item.nombre,
                    cantidad: item.cantidad,
                    motivo: item.motivo || 'No especificado'
                }));

                let fotosVencidosBase64 = null;
                if (ventaConDatos.fotoVencidas) {
                    fotosVencidosBase64 = await convertirFotosABase64(ventaConDatos.fotoVencidas);
                }

                console.log('⚠️ Novedades detectadas:', novedades);
                if (productosVencidosFormateados.length > 0) {
                    console.log('🗑️ Vencidas detectadas en pedido:', productosVencidosFormateados.length);
                }

                // 3. Actualizar en Backend
                await actualizarPedido(pedidoClienteSeleccionado.id, {
                    estado: 'ENTREGADA',
                    total: ventaConDatos.total,
                    metodo_pago: ventaConDatos.metodo_pago,
                    detalles: detallesNuevos,
                    novedades: novedades,
                    productos_vencidos: productosVencidosFormateados, // 🆕 Enviar vencidas
                    foto_vencidos: fotosVencidosBase64, // 🆕 Enviar fotos base64
                    fecha_entrega: fechaFormateada.split('T')[0]
                });

                // 🆕 ACTUALIZAR LISTAS LOCALES INMEDIATAMENTE
                // Mover de Pendientes a Entregados para actualizar la UI (Badge Verde)
                setPedidosPendientes(prev => prev.filter(p => String(p.id) !== String(pedidoClienteSeleccionado.id)));

                // Recargar explícitamente la lista de pendientes para asegurar sincronización
                const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
                verificarPedidosPendientes(fechaStr);

                setPedidosEntregadosHoy(prev => [...prev, {
                    ...pedidoClienteSeleccionado,
                    destinatario: pedidoClienteSeleccionado.destinatario || clienteSeleccionado?.negocio || clienteSeleccionado?.nombre || 'Cliente', // 🆕 Asegurar destinatario para match visual
                    estado: 'ENTREGADA',
                    total: ventaConDatos.total,
                    detalles: detallesNuevos,
                    novedades: novedades
                }]);

                // Mock de respuesta para la UI
                ventaGuardada = {
                    ...ventaConDatos,
                    id: pedidoClienteSeleccionado.numero_pedido,
                    es_pedido: true
                };

            } else {
                // Venta Normal
                ventaGuardada = await guardarVenta(ventaConDatos);
            }

            console.log('✅ Proceso finalizado:', ventaGuardada.id);

            // 🆕 ACTUALIZAR STOCK EN TIEMPO REAL
            // IMPORTANTE: Solo afectar stock si es VENTA DIRECTA.
            // Los pedidos asignados ya tienen su stock reservado/descontado en el cargue inicial.
            if (!pedidoClienteSeleccionado) {
                // Restar las cantidades vendidas del stock local
                const nuevoStock = { ...stockCargue };

                // 1. Restar productos vendidos
                Object.keys(carrito).forEach(productoId => {
                    const producto = productos.find(p => p.id === parseInt(productoId));
                    if (producto) {
                        const nombreProducto = producto.nombre.toUpperCase();
                        const cantidadVendida = carrito[productoId];
                        const stockActual = nuevoStock[nombreProducto] || 0;
                        nuevoStock[nombreProducto] = Math.max(0, stockActual - cantidadVendida);
                        console.log(`📉 Vendido: ${nombreProducto}: ${stockActual} -> ${nuevoStock[nombreProducto]}`);
                    }
                });

                // 2. Restar productos vencidos (también salen del stock si es cambio mano a mano)
                if (vencidas && vencidas.length > 0) {
                    vencidas.forEach(item => {
                        const nombreProducto = item.nombre.toUpperCase();
                        const cantidadVencida = item.cantidad || 0;
                        const stockActual = nuevoStock[nombreProducto] || 0;
                        nuevoStock[nombreProducto] = Math.max(0, stockActual - cantidadVencida);
                        console.log(`🗑️ Vencido: ${nombreProducto}: ${stockActual} -> ${nuevoStock[nombreProducto]}`);
                    });
                }

                setStockCargue(nuevoStock);
            }

            // 🆕 Actualizar contador y agregar venta al estado inmediatamente
            // SOLO SI ES VENTA DE RUTA (NO PEDIDO) para evitar doble conteo en cierre
            if (!pedidoClienteSeleccionado) {
                setTotalVentasHoy(prev => prev + 1);
                setTotalDineroHoy(prev => prev + ventaConDatos.total);
            }

            // ✅ Agregar venta recién guardada al estado inmediatamente (sin esperar recarga)
            setVentasDelDia(prev => [...prev, {
                ...ventaGuardada,
                cliente_nombre: ventaConDatos.cliente_nombre,
                cliente_negocio: ventaConDatos.cliente_negocio,
                fecha: ventaConDatos.fecha,
                total: ventaConDatos.total
            }]);

            // 🆕 UX: El avance de cliente se hará DESPUÉS de que interactúen con el modal de Imprimir.

            // Cerrar modal después de actualizar datos
            setMostrarResumen(false);

            // Actualizar contador de pendientes en segundo plano (no bloquea)
            verificarPendientes();

            // 🆕 LIMPIEZA CRÍTICA: Limpiar estado inmediatamente para evitar duplicados si el usuario tarda en cerrar el Alert
            // Guardamos copia para el ticket/alert
            const ventaParaTicket = { ...ventaGuardada };

            // Limpiar estados reactivos que podrían causar reenvíos
            setVentaTemporal(null);
            // No limpiamos el carrito completamente aún si queremos imprimir, PERO
            // invalidamos la capacidad de reenviar la misma venta.
            // Mejor opción: Marcar como procesado.

            // Preparar opciones del alert
            const alertOptions = [
                {
                    text: 'Cerrar',
                    onPress: () => {
                        limpiarVenta();
                        avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });
                    },
                    style: 'cancel'
                }
            ];

            // Agregar opción de imprimir
            alertOptions.unshift({
                text: 'Imprimir',
                onPress: async () => {
                    try {
                        await imprimirTicket(ventaGuardada);
                        limpiarVenta(); // Solo limpiar si la impresión fue exitosa
                        avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });
                    } catch (error) {
                        console.error('❌ Error al imprimir:', error);
                        Alert.alert(
                            '⚠️ Error de Impresión',
                            'No se pudo imprimir el ticket. Verifica que el Bluetooth esté conectado.\n\nLa venta ya fue guardada correctamente.',
                            [{ text: 'OK' }]
                        );
                        // NO limpiar venta en caso de error para mantener el turno activo
                    }
                }
            });

            // Agregar opción de WhatsApp si se proporcionó número
            if (opcionesEnvio?.whatsapp) {
                alertOptions.push({
                    text: 'WhatsApp',
                    onPress: () => {
                        enviarFacturaWhatsApp(ventaGuardada, opcionesEnvio.whatsapp, () => {
                            avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });
                        });
                    }
                });
            }

            // Agregar opción de Correo si se proporcionó
            if (opcionesEnvio?.correo || opcionesEnvio?.email) {
                alertOptions.push({
                    text: 'Correo',
                    onPress: () => {
                        enviarFacturaCorreo(ventaGuardada, opcionesEnvio.correo || opcionesEnvio.email, () => {
                            avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });
                        });
                    }
                });
            }

            // 🆕 Usar setTimeout para asegurar que el modal se cierre antes de lanzar el Alert
            setTimeout(() => {
                Alert.alert(
                    'Venta Completada',
                    `Venta guardada exitosamente\nTotal: ${formatearMoneda(ventaConDatos.total)}\nMétodo: ${metodoPago}`,
                    alertOptions
                );
            }, 500);
        } catch (error) {
            console.error('❌ Error en confirmarVenta:', error);
            Alert.alert('Error', 'No se pudo guardar la venta');
        } finally {
            // 🆕 Liberar el flag cuando termine (éxito o error)
            guardandoVentaRef.current = false;
            console.log('🔓 Venta procesada, flag liberado');
        }
    };

    // Enviar ticket PDF por WhatsApp (abre directamente al número)
    const enviarFacturaWhatsApp = async (venta, numero, onSuccessCallback = null) => {
        try {
            // Generar el PDF del ticket
            const { generarTicketPDF } = require('../../services/printerService');
            const pdfUri = await generarTicketPDF(venta);

            // Formatear número (agregar código de país si no lo tiene)
            let numeroFormateado = numero.replace(/\D/g, '');
            if (!numeroFormateado.startsWith('57')) {
                numeroFormateado = '57' + numeroFormateado;
            }

            // Abrir WhatsApp con el número específico
            const whatsappUrl = `whatsapp://send?phone=${numeroFormateado}`;

            // Primero compartir el PDF
            const Sharing = require('expo-sharing');
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(pdfUri, {
                    mimeType: 'application/pdf',
                    dialogTitle: 'Enviar ticket'
                });
            }

            limpiarVenta(); // Solo limpiar si todo fue exitoso
            if (onSuccessCallback) onSuccessCallback();
        } catch (error) {
            console.error('Error al enviar por WhatsApp:', error);
            Alert.alert(
                '⚠️ Error al Enviar',
                'No se pudo generar el ticket para WhatsApp.\n\nLa venta ya fue guardada correctamente.',
                [{ text: 'OK' }]
            );
            // NO limpiar venta en caso de error
        }
    };

    // Enviar ticket por correo electrónico
    const enviarFacturaCorreo = async (venta, correo, onSuccessCallback = null) => {
        try {
            // Generar el PDF del ticket
            const { generarTicketPDF } = require('../../services/printerService');
            const pdfUri = await generarTicketPDF(venta);

            // Crear el asunto y cuerpo del correo
            const asunto = `Factura de Venta #${venta.id} - Arepas El Guerrero`;
            const cuerpo = `Adjunto encontrará la factura de su compra.\n\nTotal: $${formatearMoneda(venta.total)}\nFecha: ${new Date(venta.fecha).toLocaleDateString()}\n\n¡Gracias por su compra!`;

            // Abrir cliente de correo con el PDF adjunto
            const mailUrl = `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

            // Primero intentar abrir el correo
            const canOpen = await Linking.canOpenURL(mailUrl);
            if (canOpen) {
                await Linking.openURL(mailUrl);
            }

            // Luego compartir el PDF para que pueda adjuntarlo
            const Sharing = require('expo-sharing');
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(pdfUri, {
                    mimeType: 'application/pdf',
                    dialogTitle: 'Adjuntar ticket al correo'
                });
            }

            limpiarVenta(); // Solo limpiar si todo fue exitoso
            if (onSuccessCallback) onSuccessCallback();
        } catch (error) {
            console.error('Error al enviar por correo:', error);
            Alert.alert(
                '⚠️ Error al Enviar',
                'No se pudo enviar por correo electrónico.\n\nLa venta ya fue guardada correctamente.',
                [{ text: 'OK' }]
            );
            // NO limpiar venta en caso de error
        }
    };

    // Limpiar venta
    const limpiarVenta = () => {
        setCarrito({});
        setDescuento(0);
        setVencidas([]);
        setFotoVencidas(null);
        setVentaTemporal(null);
        setMostrarResumen(false);
        setNota('');
        setBusquedaProducto('');
        setPedidoClienteSeleccionado(null); // 🆕 Limpiar pedido del cliente
        setPreciosPersonalizados({}); // 🆕 Limpiar precios personalizados
        setModoEdicionPedido(false); // 🆕 Resetear modo edición
    };

    const esClientePedido = (cliente) => {
        if (!cliente) return false;

        const tipoNegocio = (cliente?.tipo_negocio || '').toString().toUpperCase();
        if (tipoNegocio.includes('PEDIDOS')) return true;

        const idCliente = String(cliente?.id || '');
        const norm = (s) => (s || '').toString().trim().toUpperCase();
        const negocio = norm(cliente?.negocio);
        const nombre = norm(cliente?.nombre);

        return (clientesOrdenDia || []).some((c) => {
            const cTipo = (c?.tipo_negocio || '').toString().toUpperCase();
            if (!cTipo.includes('PEDIDOS')) return false;

            if (idCliente && String(c?.id || '') === idCliente) return true;
            return norm(c?.negocio) === negocio || norm(c?.nombre) === nombre;
        });
    };

    const seleccionarClienteDirecto = async (cliente) => {
        if (!cliente) return;
        setClienteSeleccionadoEsPedido(esClientePedido(cliente));
        setClienteSeleccionado(cliente);

        // 🆕 Consultar ventas backend del día sin bloquear (Fire-and-forget)
        if (fechaSeleccionada && userId) {
            (async () => {
                try {
                    const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
                    const vendedorIdV = String(userId).toUpperCase().startsWith('ID')
                        ? String(userId).toUpperCase() : `ID${userId}`;
                    const resp = await fetch(`${API_URL}/api/ventas-ruta/?vendedor_id=${vendedorIdV}&fecha=${fechaStr}`);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (Array.isArray(data)) setVentasBackendDia(data);
                    }
                } catch (e) { /* offline: usa solo locales */ }
            })();
        }

        setPreciosPersonalizados({});
        verificarPedidoCliente(cliente);
    };

    // Manejar selección de cliente
    const handleSeleccionarCliente = (cliente) => {
        // ✅ OPTIMIZACIÓN: Cerrar modal INMEDIATAMENTE para mejor UX
        setMostrarSelectorCliente(false);

        // Limpiar datos previos
        setCarrito({});
        setVencidas([]);
        setFotoVencidas(null);
        setNota('');
        setModoEdicionPedido(false); // 🆕 Resetear modo edición al cambiar cliente

        // 🆕 LÓGICA DE PRECIOS AUTOMÁTICA (Estilo "Cargar Pedido")
        const nuevosPrecios = {};
        // Soportar propiedad de ruta o general
        const listaCliente = cliente.lista_precio_nombre || cliente.tipo_lista_precio;

        if (listaCliente) {
            console.log(`🤑 Aplicando lista de precios: ${listaCliente}`);

            // Iterar PRODUCTOS (catálogo cargado) y buscar precio en lista
            productos.forEach(prod => {
                const nombreProd = prod.nombre.toUpperCase();
                let preciosAlt = preciosAlternosCargue[nombreProd];

                // Búsqueda robusta (si no encuentra exacto, busca parcial)
                if (!preciosAlt) {
                    const key = Object.keys(preciosAlternosCargue).find(k => k.includes(nombreProd) || nombreProd.includes(k));
                    if (key) preciosAlt = preciosAlternosCargue[key];
                }

                if (preciosAlt && preciosAlt[listaCliente]) {
                    nuevosPrecios[prod.id] = preciosAlt[listaCliente];
                }
            });

            // Si se encontraron precios, avisar o loguear
            if (Object.keys(nuevosPrecios).length > 0) {
                // Alert.alert("💲 Precios Actualizados", `Se aplicaron precios de lista "${listaCliente}" para ${Object.keys(nuevosPrecios).length} productos.`);
                console.log(`✅ Precios aplicados para ${Object.keys(nuevosPrecios).length} productos`);
            }
        }

        setPreciosPersonalizados(nuevosPrecios); // 🆕 Aplicar precios masivamente



        // 🆕 Verificar si ya le vendió hoy
        const norm = (str) => str ? str.toString().toUpperCase().trim() : '';
        const cNegocio = norm(cliente.negocio);
        const cNombre = norm(cliente.nombre);

        const anuladoEnBackend = ventasBackendDia.some(b =>
            b.estado === 'ANULADA' &&
            ((b.nombre_negocio && norm(b.nombre_negocio) === cNegocio) ||
                (b.cliente_nombre && norm(b.cliente_nombre) === cNombre))
        );

        const yaVendidoHoy = !anuladoEnBackend && ventasDelDia.some(venta => {
            if (venta.estado === 'ANULADA') return false; // 🆕 Ignorar anuladas explícitas
            const vNegocio = norm(venta.cliente_negocio);
            const vNombre = norm(venta.cliente_nombre);
            return (vNegocio && vNegocio === cNegocio) || (vNombre && vNombre === cNombre);
        });

        if (yaVendidoHoy) {
            Alert.alert(
                '⚠️ Cliente con Venta',
                `Ya realizaste una venta a ${cliente.negocio || cliente.nombre} el día de hoy.\n\n¿Deseas continuar de todas formas?`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Sí, Continuar',
                        onPress: () => {
                            seleccionarClienteDirecto(cliente);
                        }
                    }
                ]
            );
            return;
        }

        seleccionarClienteDirecto(cliente);
    };

    const avanzarAlSiguienteCliente = ({ limpiarAntes = false, mostrarAvisoFin = true } = {}) => {
        const lista = Array.isArray(clientesOrdenDia) ? clientesOrdenDia : [];

        if (lista.length === 0) {
            if (mostrarAvisoFin) {
                Alert.alert('Sin lista del día', 'Abre la lista de clientes para cargar el orden del día.');
            }
            return;
        }

        if (limpiarAntes) {
            limpiarVenta();
        }

        if (!clienteSeleccionado) {
            seleccionarClienteDirecto(lista[0]);
            return;
        }

        const idActual = String(clienteSeleccionado.id);
        let idx = lista.findIndex((c) => String(c.id) === idActual);

        if (idx < 0) {
            const norm = (s) => (s || '').toString().trim().toUpperCase();
            const negocioActual = norm(clienteSeleccionado.negocio);
            const nombreActual = norm(clienteSeleccionado.nombre);
            idx = lista.findIndex((c) => norm(c.negocio) === negocioActual || norm(c.nombre) === nombreActual);
        }

        const siguiente = idx >= 0 ? lista[idx + 1] : lista[0];
        if (siguiente) {
            seleccionarClienteDirecto(siguiente);
            return;
        }

        // 🆕 Es el último cliente — mostrar alerta de ruta completada y ofrecer volver al inicio
        if (mostrarAvisoFin) {
            Alert.alert(
                '🎉 ¡Ruta completada!',
                `Has llegado al final de la lista del día.\n\n¿Deseas volver al primer cliente para un segundo recorrido?`,
                [
                    {
                        text: 'No, quedarme aquí',
                        style: 'cancel',
                    },
                    {
                        text: 'Volver al inicio',
                        onPress: () => {
                            if (limpiarAntes) limpiarVenta();
                            seleccionarClienteDirecto(lista[0]);
                        }
                    }
                ]
            );
        }
    };

    useEffect(() => {
        if (clienteSeleccionado) {
            setClienteSeleccionadoEsPedido(esClientePedido(clienteSeleccionado));
        } else {
            setClienteSeleccionadoEsPedido(false);
        }
    }, [clienteSeleccionado, clientesOrdenDia]);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => {
            setTecladoAbierto(true);
            if (indiceCantidadEnFocoRef.current !== null) {
                asegurarVisibilidadInputCantidad(indiceCantidadEnFocoRef.current, false);
            }
        });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => {
            setTecladoAbierto(false);
            setForzarMostrarTurno(false); // Resetear vistazo al cerrar teclado
            indiceCantidadEnFocoRef.current = null;
        });
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [asegurarVisibilidadInputCantidad]);

    // Cargar orden del día en segundo plano para que el auto-siguiente funcione sin abrir selector
    useEffect(() => {
        const cargarOrdenDiaSilencioso = async () => {
            try {
                if (!turnoAbierto || !diaSeleccionado || !userId) return;

                const dia = diaSeleccionado.toUpperCase();
                const response = await fetch(`${API_URL}/api/clientes-ruta/?vendedor_id=${userId}&dia=${dia}`);
                if (!response.ok) return;

                const data = await response.json();
                if (!Array.isArray(data)) return;

                const clientesFormateados = data.map((c) => ({
                    id: c.id?.toString?.() || String(c.id),
                    nombre: c.nombre_contacto || c.nombre_negocio,
                    negocio: c.nombre_negocio,
                    tipo_negocio: c.tipo_negocio || '',
                }));

                setClientesOrdenDia(clientesFormateados);
            } catch (error) {
                // Silencioso: no bloquea venta
            }
        };

        cargarOrdenDiaSilencioso();
    }, [turnoAbierto, diaSeleccionado, userId]);

    // 🆕 Verificar si el cliente tiene pedido pendiente
    const verificarPedidoCliente = (cliente) => {
        const norm = (str) => str ? str.toString().toUpperCase().trim() : '';
        const cNegocio = norm(cliente.negocio);
        const cNombre = norm(cliente.nombre);

        const pedidosCliente = pedidosPendientes.filter(p => {
            const pDestinatario = norm(p.destinatario);
            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
        });

        const obtenerPuntajePedido = (pedido) => {
            const estado = (pedido?.estado || '').toString().toUpperCase();
            const prioridadEstado = estado === 'ANULADA' ? 0 : 1; // Preferir pedidos realmente pendientes
            const numeroPedido = parseInt(String(pedido?.numero_pedido || '').replace(/\D/g, ''), 10);
            const numeroNormalizado = Number.isFinite(numeroPedido) ? numeroPedido : 0;
            const fecha = new Date(pedido?.fecha_actualizacion || pedido?.fecha || 0).getTime() || 0;
            const id = Number(pedido?.id) || 0;
            return { prioridadEstado, numeroNormalizado, fecha, id };
        };

        const pedido = pedidosCliente
            .slice()
            .sort((a, b) => {
                const pa = obtenerPuntajePedido(a);
                const pb = obtenerPuntajePedido(b);

                if (pb.prioridadEstado !== pa.prioridadEstado) return pb.prioridadEstado - pa.prioridadEstado;
                if (pb.numeroNormalizado !== pa.numeroNormalizado) return pb.numeroNormalizado - pa.numeroNormalizado;
                if (pb.fecha !== pa.fecha) return pb.fecha - pa.fecha;
                return pb.id - pa.id;
            })[0] || null;

        setPedidoClienteSeleccionado(pedido);

        // 🆕 Si hay pedido y el cliente no tiene dirección, usar la del pedido
        if (pedido && pedido.direccion_entrega && !cliente.direccion) {
            setClienteSeleccionado({
                ...cliente,
                direccion: pedido.direccion_entrega
            });
        }

        console.log('🔍 Pedido del cliente:', pedido ? `#${pedido.numero_pedido}` : 'Sin pedido');
    };

    // 🆕 Editar pedido del cliente seleccionado (cargar en carrito)
    const editarPedidoClienteSeleccionado = () => {
        if (!pedidoClienteSeleccionado) return;

        const nuevoCarrito = {};
        let encontrados = 0;

        pedidoClienteSeleccionado.detalles.forEach(d => {
            // Buscar producto en catálogo local por ID o nombre
            const prodReal = productos.find(p => p.id === d.producto || p.nombre === d.producto_nombre);

            if (prodReal) {
                encontrados++;
                // Construir objeto carrito con ID como clave
                nuevoCarrito[prodReal.id] = d.cantidad; // Solo la cantidad
            }
        });

        setCarrito(nuevoCarrito);

        // 🆕 Cargar precios personalizados del pedido original
        const nuevosPrecios = {};
        pedidoClienteSeleccionado.detalles.forEach(d => {
            // Buscar el producto localmente para obtener SU ID real usado en la App
            const prodReal = productos.find(p => p.id === d.producto || p.nombre === d.producto_nombre);
            const precioUnitario = parseFloat(d.precio_unitario);

            if (prodReal && !isNaN(precioUnitario)) {
                // Usar el ID del producto LOCAL como clave, igual que el carrito
                nuevosPrecios[prodReal.id] = precioUnitario;
                console.log(`💲 Precio personalizado para ${prodReal.nombre}: ${precioUnitario}`);
            }
        });
        setPreciosPersonalizados(nuevosPrecios);

        // 🆕 Activar modo edición para permitir cambiar cantidades
        setModoEdicionPedido(true);

        Alert.alert(
            '✏️ Pedido Cargado',
            `Se cargaron ${encontrados} productos del pedido.\n\nPuedes modificar las cantidades y completar la venta.`
        );
    };

    // 🆕 Marcar pedido del cliente seleccionado como entregado
    const marcarEntregadoClienteSeleccionado = () => {
        if (!pedidoClienteSeleccionado) return;
        marcarPedidoEntregado(pedidoClienteSeleccionado);
    };



    // Manejar cliente guardado
    const handleClienteGuardado = async (nuevoCliente) => {
        setClienteSeleccionado(nuevoCliente);
        // 🆕 LIMPIAR precios personalizados al cambiar cliente para que se apliquen los de la lista
        setPreciosPersonalizados({});
        // Recargar lista de clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Invalidar caché de selector para forzar datos frescos al abrir
        try {
            const dia = (diaSeleccionado || '').toUpperCase();
            await AsyncStorage.multiRemove([
                `clientes_cache_${userId}`,
                `clientes_cache_todos_${userId}`,
                `clientes_cache_dia_${userId}_${dia}`
            ]);
        } catch (error) {
            // No crítico
        }
    };

    // Manejar vencidas
    const handleGuardarVencidas = (productosVencidos, foto) => {
        setVencidas(productosVencidos);
        setFotoVencidas(foto);
    };

    // 🆕 Manejar cerrar turno
    const handleCerrarTurno = async () => {
        try {
            // 🔒 Seguridad operativa: no cerrar turno con ventas offline pendientes
            const pendientesActuales = await obtenerVentasPendientes();
            if (pendientesActuales.length > 0) {
                Alert.alert(
                    'Sincronización pendiente',
                    `Tienes ${pendientesActuales.length} venta${pendientesActuales.length > 1 ? 's' : ''} sin enviar.\n\nSincroniza antes de cerrar turno para no descuadrar inventario y reportes.`,
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                            text: 'Sincronizar ahora',
                            onPress: () => onRefresh()
                        }
                    ]
                );
                return;
            }

            // 🔧 CORREGIDO: Usar fechaSeleccionada en lugar de fecha actual
            const fechaFormateada = fechaSeleccionada.toISOString().split('T')[0];

            console.log(`🔒 CERRAR TURNO - Fecha: ${fechaFormateada}, Vendedor: ${userId}`);
            console.log(`   Vencidas a reportar:`, vencidas);

            // Preparar productos vencidos en formato correcto
            const productosVencidosFormateados = vencidas.map(item => ({
                producto: item.nombre,
                cantidad: item.cantidad
            }));

            console.log(`   Productos formateados:`, productosVencidosFormateados);

            // Procesar cierre directamente (el modal ya sirvió como confirmación)
            await procesarCierreTurno(fechaFormateada, productosVencidosFormateados);

        } catch (error) {
            console.error('Error:', error);
            Alert.alert('Error', 'Ocurrió un error inesperado');
        }
    };

    // Función para procesar el cierre de turno
    const procesarCierreTurno = async (fecha, vencidos) => {
        try {
            console.log(`📤 Enviando a ${ENDPOINTS.CERRAR_TURNO}`);

            // 🆕 Timeout de 30 segundos (cierre puede tardar por cálculos)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(ENDPOINTS.CERRAR_TURNO, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id_vendedor: userId,
                    fecha: fecha,
                    productos_vencidos: vencidos,
                    diferencia_precios: diferenciaPrecios
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            console.log(`📥 Respuesta:`, data);

            if (data.success) {
                // Mostrar resumen
                const resumenTexto = data.resumen.map(item =>
                    `${item.producto}:\n` +
                    `  Cargado: ${item.cargado}\n` +
                    `  Vendido: ${item.vendido}\n` +
                    `  Vencidas: ${item.vencidas}\n` +
                    `  Devuelto: ${item.devuelto}`
                ).join('\n\n');

                Alert.alert(
                    '✅ Turno Cerrado',
                    `Resumen del día:\n\n${resumenTexto}\n\n` +
                    `📊 TOTALES:\n` +
                    `Cargado: ${data.totales.cargado}\n` +
                    `Vendido: ${data.totales.vendido}\n` +
                    `Vencidas: ${data.totales.vencidas}\n` +
                    `Devuelto: ${data.totales.devuelto}\n\n` +
                    (data.novedad ? `${data.novedad}\n\n` : '') +
                    `✅ Datos enviados al CRM`,
                    [
                        {
                            text: 'OK',
                            onPress: async () => {
                                // 🆕 Guardar novedad en localStorage para que el frontend la muestre
                                if (data.novedad) {
                                    const fechaStr = fecha.split('T')[0];
                                    const novedadKey = `novedad_precios_${userId}_${fechaStr}`;
                                    AsyncStorage.setItem(novedadKey, data.novedad);
                                    console.log(`💾 Novedad guardada: ${novedadKey}`);
                                }

                                // Limpiar todo el estado
                                setTotalVentasHoy(0);
                                setTotalDineroHoy(0);
                                setDiferenciaPrecios(0);
                                setVencidas([]);
                                setMostrarModalCerrarTurno(false);
                                setTurnoAbierto(false);
                                setHoraTurno(null);
                                setStockCargue({});
                                await limpiarVentasLocales();
                                await AsyncStorage.removeItem(`@turno_activo_${userId}`); // 🆕 Limpiar turno offline

                                // Redirigir al menú principal
                                navigation.navigate('Options', { userId, vendedorNombre });
                            }
                        }
                    ]
                );
            } else if (data.error === 'TURNO_YA_CERRADO') {
                // 🆕 Turno ya fue cerrado anteriormente
                Alert.alert(
                    '⚠️ Turno Ya Cerrado',
                    'El turno para este día ya fue cerrado anteriormente.\n\nNo se pueden enviar devoluciones duplicadas.',
                    [{
                        text: 'OK',
                        onPress: () => {
                            setMostrarModalCerrarTurno(false);
                            setTurnoAbierto(false);
                            setHoraTurno(null);
                            setStockCargue({});
                            AsyncStorage.removeItem(`@turno_activo_${userId}`); // 🆕 Limpiar turno offline
                            navigation.navigate('Options', { userId, vendedorNombre });
                        }
                    }]
                );
            } else {
                Alert.alert('Error', data.error || 'No se pudo cerrar el turno');
            }
        } catch (error) {
            console.error('Error cerrando turno:', error);
            Alert.alert('Error', 'No se pudo conectar con el servidor');
        }
    };


    const renderProducto = useCallback(({ item, index }) => {
        const cantidad = getCantidad(item.id);
        const precioReal = getPrecioProducto(item); // 🆕 Usar precio dinámico
        const subtotalProducto = precioReal * cantidad;

        // 🆕 Obtener stock del cargue
        const stock = stockCargue[item.nombre.toUpperCase()] || 0;

        // Verificar si es un precio especial
        const esPrecioEspecial = precioReal !== item.precio;

        // 🛡️ Deshabilitar si no hay cliente seleccionado
        const sinCliente = !clienteSeleccionado || clienteSeleccionado.id === 'general';

        // 🆕 Deshabilitar si hay pedido pendiente Y NO está en modo edición
        const pedidoBloqueado = pedidoClienteSeleccionado && !modoEdicionPedido;

        // Deshabilitar controles si no hay cliente O si el pedido está bloqueado
        const controlesDeshabilitados = sinCliente || pedidoBloqueado;

        return (
            <View style={styles.productoItem}>
                <View style={styles.productoInfo}>
                    <Text style={styles.productoNombre}>{item.nombre}</Text>
                    <Text style={styles.productoPrecio}>
                        Precio: {formatearMoneda(precioReal)}
                        {esPrecioEspecial && <Text style={{ color: '#ff9800', fontWeight: 'bold' }}> ⭐</Text>}
                        {stock > 0 && <Text style={styles.stockTexto}> ({stock})</Text>}
                    </Text>
                    {cantidad > 0 && (
                        <Text style={styles.productoSubtotal}>
                            Total: {formatearMoneda(subtotalProducto)}
                        </Text>
                    )}
                </View>

                <View style={styles.cantidadControl}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.btnCantidad,
                            pressed && { opacity: 0.6 }
                        ]}
                        onPress={() => actualizarCantidad(item.id, cantidad - 1)}
                        disabled={cantidad === 0 || controlesDeshabilitados}
                        android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                        <Ionicons name="remove" size={20} color="white" />
                    </Pressable>

                    {controlesDeshabilitados ? (
                        <View style={[styles.inputCantidad, { justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{cantidad}</Text>
                        </View>
                    ) : (
                        <TextInput
                            style={styles.inputCantidad}
                            value={String(cantidad)}
                            onChangeText={(texto) => {
                                const num = parseInt(texto) || 0;
                                actualizarCantidad(item.id, num);
                            }}
                            keyboardType="numeric"
                            selectTextOnFocus
                            onFocus={() => {
                                indiceCantidadEnFocoRef.current = index;
                                setInputCantidadEnFoco(true);
                                asegurarVisibilidadInputCantidad(index);
                            }}
                            onBlur={() => {
                                setInputCantidadEnFoco(false);
                                indiceCantidadEnFocoRef.current = null;
                            }}
                        />
                    )}

                    <Pressable
                        style={({ pressed }) => [
                            styles.btnCantidad,
                            pressed && { opacity: 0.6 }
                        ]}
                        onPress={() => actualizarCantidad(item.id, cantidad + 1)}
                        disabled={controlesDeshabilitados}
                        android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                        <Ionicons name="add" size={20} color="white" />
                    </Pressable>
                </View>
            </View>
        );
    }, [carrito, stockCargue, clienteSeleccionado, pedidoClienteSeleccionado, modoEdicionPedido, actualizarCantidad, asegurarVisibilidadInputCantidad]);

    // 🆕 Handler para cuando se guarda una nota
    const handleNotaGuardada = async (nota) => {
        // Actualizar cliente seleccionado localmente
        if (clienteSeleccionado) {
            setClienteSeleccionado({
                ...clienteSeleccionado,
                nota: nota
            });
        }

        // Recargar lista completa de clientes para mantener consistencia
        // (Esto asegura que si cambias de cliente y vuelves, la nota persista)
        const clientesData = await obtenerClientes();
        setClientes(clientesData);
    };

    return (
        <View style={styles.container}>
            {/* Modal rápido de confirmación de sincronización offline */}
            <Modal
                visible={mostrarModalSyncRapido}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setMostrarModalSyncRapido(false)}
            >
                <View style={styles.modalSyncOverlay}>
                    <View style={styles.modalSyncCard}>
                        <Ionicons name="cloud-done-outline" size={18} color="#0b8043" />
                        <Text style={styles.modalSyncTexto}>{textoModalSyncRapido}</Text>
                    </View>
                </View>
            </Modal>

            {/* 🆕 Banner de conectividad — mantener visible para evitar desplazamientos del header al abrir teclado */}
            {(!clienteSeleccionado || forzarMostrarTurno) && (
                <>
                    {estadoBanner === 'offline' && (
                        <View style={styles.bannerOffline}>
                            <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
                            <Text style={styles.bannerTexto}>Sin internet — ventas se guardan localmente</Text>
                        </View>
                    )}
                    {estadoBanner === 'sincronizando' && (
                        <View style={styles.bannerSincronizando}>
                            <Ionicons name="sync-outline" size={16} color="#fff" />
                            <Text style={styles.bannerTexto}>Sincronizando ventas pendientes...</Text>
                        </View>
                    )}
                    {estadoBanner === 'exito' && (
                        <View style={styles.bannerExito}>
                            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            <Text style={styles.bannerTexto}>{ventasSincronizadas} {ventasSincronizadas === 1 ? 'venta enviada' : 'ventas enviadas'} ✅</Text>
                        </View>
                    )}
                </>
            )}

            {/* 🆕 Pantalla de carga mientras verifica turno */}
            {verificandoTurno && (
                <View style={styles.cargandoOverlay}>
                    <View style={styles.cargandoContainer}>
                        <Ionicons name="time-outline" size={48} color="#003d88" />
                        <Text style={styles.cargandoTexto}>Verificando turno...</Text>
                    </View>
                </View>
            )}

            {/* Indicador de ventas pendientes */}
            {ventasPendientes > 0 && (
                <TouchableOpacity
                    style={styles.pendientesBar}
                    onPress={onRefresh}
                >
                    <Ionicons name="cloud-upload-outline" size={16} color="white" />
                    <Text style={styles.pendientesText}>
                        {ventasPendientes} venta{ventasPendientes > 1 ? 's' : ''} pendiente{ventasPendientes > 1 ? 's' : ''} de sincronizar
                    </Text>
                    <Ionicons name="refresh" size={16} color="white" />
                </TouchableOpacity>
            )}

            {/* 🆕 Indicador de Turno - Optimizado: Si hay cliente, se oculta tras la manija por defecto para ganar espacio total */}
            {(turnoAbierto && (forzarMostrarTurno || (!clienteSeleccionado && !tecladoAbierto && !inputBuscadorEnFoco))) && (
                <View style={[styles.turnoIndicador, forzarMostrarTurno && styles.turnoIndicadorForzado]}>
                    <View style={styles.turnoIndicadorContent}>
                        <View style={styles.puntoVerde} />
                        <Text style={styles.turnoTexto}>
                            Turno Abierto {horaTurno ? `• ${horaTurno.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.turnoDia}>
                            {diaSeleccionado?.substring(0, 3)} • {fechaSeleccionada?.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </Text>
                        <TouchableOpacity
                            onPress={() => {
                                setTurnoAbierto(false);
                                setMostrarSelectorDia(true);
                                setForzarMostrarTurno(false);
                            }}
                            style={styles.btnCambiarDia}
                        >
                            <Ionicons name="calendar-outline" size={16} color="#003d88" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={abrirHistorialReimpresion}
                            style={[styles.btnCambiarDia, { marginLeft: 2 }]}
                        >
                            <Ionicons name="receipt-outline" size={16} color="#003d88" />
                        </TouchableOpacity>

                        {forzarMostrarTurno && (
                            <TouchableOpacity
                                onPress={() => setForzarMostrarTurno(false)}
                                style={[styles.btnCambiarDia, { marginLeft: 2, backgroundColor: '#ffebee' }]}
                            >
                                <Ionicons name="close-circle-outline" size={18} color="#f44336" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* 🆕 Pestaña (Manija) para revelar turno - Aparece cuando hay cliente y el turno está oculto */}
            {turnoAbierto && clienteSeleccionado && !forzarMostrarTurno && (
                <TouchableOpacity
                    style={styles.manijaRevelarTurno}
                    onPress={() => setForzarMostrarTurno(true)}
                    activeOpacity={0.5}
                >
                    <View style={styles.manijaIndicador} />
                </TouchableOpacity>
            )}

            {!turnoAbierto && !mostrarSelectorDia && !verificandoTurno && !tecladoAbierto && !inputBuscadorEnFoco && (
                <View style={[styles.turnoIndicador, styles.turnoCerrado]}>
                    <View style={styles.turnoIndicadorContent}>
                        <View style={styles.puntoGris} />
                        <Text style={[styles.turnoTexto, { color: '#666' }]}>
                            Sin turno activo
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => setMostrarSelectorDia(true)}
                        style={styles.btnAbrirTurno}
                    >
                        <Text style={styles.btnAbrirTurnoTexto}>Abrir Turno</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Header - Cliente - Siempre visible completo para prevenir saltos */}
            <View style={[
                styles.headerCliente
            ]}>
                <View
                    style={[
                        styles.clienteSelector,
                        clienteSeleccionado && (() => {
                            const norm = (str) => str ? str.toString().toUpperCase().trim() : '';
                            const tienePedidoEntregado = pedidosEntregadosHoy.some(p => {
                                const pDestinatario = norm(p.destinatario);
                                const cNegocio = norm(clienteSeleccionado.negocio);
                                const cNombre = norm(clienteSeleccionado.nombre);
                                return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
                            });
                            return tienePedidoEntregado ? {
                                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                borderColor: '#22c55e'
                            } : null;
                        })()
                    ]}
                >
                    <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                        onPress={abrirSelectorCliente}
                    >
                        {clienteSeleccionadoEsPedido ? (
                            <View style={styles.badgeTipoHeaderPedido}><Text style={styles.badgeTipoHeaderTexto}>P</Text></View>
                        ) : (
                            <View style={styles.badgeTipoHeaderRuta}><Text style={styles.badgeTipoHeaderTexto}>R</Text></View>
                        )}
                        <View style={styles.clienteInfo}>
                            <Text style={[styles.clienteNombre, (clienteSeleccionado?.negocio || '').length > 34 && styles.clienteNombreMedio]}>
                                {clienteSeleccionado?.negocio || 'Seleccionar Cliente'}
                            </Text>
                            {/* Mostrar detalles siempre */}
                            {clienteSeleccionado && (
                                <>
                                    {clienteSeleccionado?.nombre && <Text style={styles.clienteDetalle}>👤 {clienteSeleccionado.nombre}</Text>}
                                    <Text style={styles.clienteDetalle}>
                                        {pedidoClienteSeleccionado ? `📦 Pedido #${pedidoClienteSeleccionado.numero_pedido}` : `📞 ${clienteSeleccionado?.celular || 'Sin teléfono'}`}
                                    </Text>
                                    <Text style={styles.clienteDetalle}>📍 {clienteSeleccionado?.direccion || 'Sin dirección'}</Text>
                                </>
                            )}
                        </View>
                    </TouchableOpacity>
                    {/* 🆕 Check verde si ya se le vendió hoy (NO si solo está entregado) */}
                    {clienteSeleccionado && (() => {
                        const norm = (str) => str ? str.toString().toUpperCase().trim() : '';

                        const esPedidoEntregado = pedidosEntregadosHoy.some(p => {
                            const pDestinatario = norm(p.destinatario);
                            const cNegocio = norm(clienteSeleccionado.negocio);
                            const cNombre = norm(clienteSeleccionado.nombre);
                            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
                        });

                        if (esPedidoEntregado) return null;

                        const ventaConfirmada = ventasDelDia.some(venta => {
                            if (venta.estado === 'ANULADA') return false;
                            const vNegocio = norm(venta.cliente_negocio);
                            const vNombre = norm(venta.cliente_nombre);
                            const cNegocio = norm(clienteSeleccionado.negocio);
                            const cNombre = norm(clienteSeleccionado.nombre);
                            return (vNegocio && vNegocio === cNegocio) || (vNombre && vNombre === cNombre);
                        });

                        return ventaConfirmada ? (
                            <View style={styles.headerCheckVendido}>
                                <Text style={styles.headerTextoVendido}>VENDIDO</Text>
                            </View>
                        ) : null;
                    })()}
                    {clienteSeleccionado && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity
                                style={styles.btnNotaInterno}
                                onPress={() => setMostrarNotaModal(true)}
                            >
                                <Ionicons name={clienteSeleccionado.nota ? "document-text" : "document-text-outline"} size={26} color={clienteSeleccionado.nota ? "#dc3545" : "#A0A0A0"} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ padding: 5, marginLeft: 2, marginRight: 5, justifyContent: 'center', alignItems: 'center' }}
                                onPress={() => avanzarAlSiguienteCliente({ limpiarAntes: true, mostrarAvisoFin: true })}
                            >
                                <Ionicons name="play-skip-forward" size={26} color="#003d88" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>

            {/* 🆕 Botones de acciones siempre visibles para evitar el efecto de 'empuje' al abrir el teclado */}
            <View style={styles.botonesAccionesContainer}>
                {pedidoClienteSeleccionado ? (
                    <>
                        <TouchableOpacity style={[styles.btnAccion, styles.btnEditar]} onPress={editarPedidoClienteSeleccionado}>
                            <Ionicons name="create" size={18} color="white" /><Text style={styles.btnAccionTexto}>Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btnAccion, styles.btnEntregado]} onPress={marcarEntregadoClienteSeleccionado}>
                            <Ionicons name="checkmark-circle" size={18} color="white" /><Text style={styles.btnAccionTexto}>Entregar</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <TouchableOpacity style={[styles.btnAccion, styles.btnVencidas]} onPress={() => setMostrarVencidas(true)}>
                            <Ionicons name="alert-circle" size={18} color="white" />
                            <Text style={styles.btnAccionTexto}>Vencidas</Text>
                            {vencidas.length > 0 && (
                                <View style={styles.badgeAccion}>
                                    <Text style={styles.badgeTexto}>{vencidas.length}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        {turnoAbierto && (
                            <TouchableOpacity style={[styles.btnAccion, styles.btnCerrarPequeño]} onPress={() => setMostrarModalCerrarTurno(true)}>
                                <Ionicons name="lock-closed" size={18} color="white" /><Text style={styles.btnAccionTexto}>Cerrar</Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </View>

            {/* Buscador */}
            <View style={styles.busquedaContainer}>
                <Ionicons name="search" size={20} color="#666" style={styles.iconoBusqueda} />
                <TextInput
                    ref={buscadorRef}
                    style={styles.inputBusqueda}
                    placeholder="Buscar producto..."
                    value={busquedaProducto}
                    onChangeText={setBusquedaProducto}
                    autoCapitalize="characters"
                    onFocus={() => setInputBuscadorEnFoco(true)}
                    onBlur={() => setInputBuscadorEnFoco(false)}
                />
                {busquedaProducto.length > 0 && (
                    <TouchableOpacity
                        onPress={() => {
                            setBusquedaProducto('');
                            buscadorRef.current?.focus(); // 🚀 Mantener el foco al limpiar para evitar saltos
                        }}
                    >
                        <Ionicons name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Lista de productos */}
            <FlatList
                ref={listaProductosRef}
                data={productosFiltrados}
                renderItem={renderProducto}
                keyExtractor={(item) => String(item.id)}
                style={styles.listaProductos}
                contentContainerStyle={[
                    styles.listaContent,
                    tecladoAbierto ? styles.listaContentConTeclado : styles.listaContentNormal
                ]}
                keyboardShouldPersistTaps="handled"
                onScrollToIndexFailed={(info) => {
                    const promedio = info.averageItemLength || 92;
                    const offset = Math.max(0, (info.index * promedio) - (promedio * 2.2));
                    listaProductosRef.current?.scrollToOffset({ offset, animated: true });
                    setTimeout(() => {
                        asegurarVisibilidadInputCantidad(info.index);
                    }, 120);
                }}
                // 🚀 Propiedades de optimización
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
                updateCellsBatchingPeriod={50}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#003d88']}
                        tintColor="#003d88"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="search-outline" size={48} color="#ccc" />
                        <Text style={styles.emptyText}>No se encontraron productos</Text>
                    </View>
                }
            />

            {/* Resumen y botón */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.btnCompletar,
                        (Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && vencidas.length === 0) && styles.btnDeshabilitado
                    ]}
                    onPress={completarVenta}
                    activeOpacity={0.6}
                    delayPressIn={0}
                    disabled={Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && vencidas.length === 0}
                >
                    <Ionicons name="checkmark-circle" size={24} color="white" style={styles.iconoBoton} />
                    <Text style={styles.btnCompletarTexto}>
                        {pedidoClienteSeleccionado
                            ? `CONFIRMAR PEDIDO ${formatearMoneda(total)}`
                            : (Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && vencidas.length > 0)
                                ? 'REGISTRAR VENCIDAS'
                                : `COMPLETAR VENTA ${formatearMoneda(total)}`
                        }
                    </Text>
                </TouchableOpacity>
            </View>


            {/* Modal Selección de Día */}
            <Modal
                visible={mostrarSelectorDia}
                animationType="fade"
                transparent={true}
            >
                <View style={styles.modalDiaOverlay}>
                    <View style={styles.modalDiaContainer}>
                        <View style={styles.modalDiaHeader}>
                            <Ionicons name="calendar" size={32} color="#003d88" />
                            <Text style={styles.modalDiaTitulo}>Selecciona el Día</Text>
                            <Text style={styles.modalDiaSubtitulo}>¿Qué día vas a trabajar?</Text>
                        </View>

                        <View style={styles.modalDiaBotones}>
                            {DIAS_SEMANA.map((dia) => {
                                const esHoy = dia === getDiaActual();
                                return (
                                    <TouchableOpacity
                                        key={dia}
                                        style={[
                                            styles.modalDiaBoton,
                                            esHoy && styles.modalDiaBotonHoy
                                        ]}
                                        onPress={() => handleSeleccionarDia(dia)}
                                    >
                                        <Text style={[
                                            styles.modalDiaBotonTexto,
                                            esHoy && styles.modalDiaBotonTextoHoy
                                        ]}>
                                            {dia}
                                        </Text>
                                        {esHoy && (
                                            <Text style={styles.modalDiaHoyLabel}>HOY</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* 🆕 Botón Volver para cerrar el modal */}
                        <TouchableOpacity
                            style={styles.modalDiaBotonVolver}
                            onPress={() => setMostrarSelectorDia(false)}
                        >
                            <Ionicons name="arrow-back" size={20} color="#666" />
                            <Text style={styles.modalDiaVolverTexto}>Volver</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* 🆕 DatePicker para Seleccionar Fecha */}
            {
                mostrarDatePicker && (
                    <DateTimePicker
                        value={fechaSeleccionada}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleConfirmarFecha}
                        maximumDate={new Date(2030, 11, 31)}
                        minimumDate={new Date(2020, 0, 1)}
                    />
                )
            }

            {/* Modales */}
            <ClienteSelector
                visible={mostrarSelectorCliente}
                onClose={() => setMostrarSelectorCliente(false)}
                onSelectCliente={handleSeleccionarCliente}
                ventasDelDia={ventasDelDia} // 🆕 Pasar ventas del día
                fechaSeleccionada={fechaSeleccionada} // 🆕 Pasar fecha para consulta backend
                pedidosPendientes={pedidosPendientes} // 🆕 Pasar pedidos pendientes
                pedidosEntregadosHoy={pedidosEntregadosHoy} // 🆕 Pasar pedidos entregados
                pedidosNoEntregadosHoy={pedidosNoEntregadosHoy} // 🆕 Pasar pedidos NO entregados
                onCargarPedido={cargarPedidoEnCarrito} // 🆕 Cargar pedido en carrito
                onMarcarEntregado={marcarPedidoEntregado} // 🆕 Marcar como entregado
                onMarcarNoEntregado={(pedido) => { // 🆕 Marcar como no entregado
                    setPedidoEnNovedad(pedido);
                    setModalNovedadVisible(true);
                }}
                onNuevoCliente={() => {
                    setMostrarSelectorCliente(false);
                    setMostrarModalCliente(true);
                }}
                onClientesDiaActualizados={setClientesOrdenDia}
                onActualizarPedidos={verificarPedidosPendientes}
                userId={userId}
                diaSeleccionado={diaSeleccionado}
            />

            <ClienteModal
                visible={mostrarModalCliente}
                onClose={() => setMostrarModalCliente(false)}
                onSelect={handleSeleccionarCliente}
                onClienteGuardado={handleClienteGuardado}
                clientes={clientes}
                vendedorId={userId}
            />



            <DevolucionesVencidas
                visible={mostrarVencidas}
                onClose={() => setMostrarVencidas(false)}
                onGuardar={handleGuardarVencidas}
                tipo="vencidas"
                datosGuardados={vencidas}
                fotosGuardadas={fotoVencidas}
                userId={userId}
                fechaSeleccionada={fechaSeleccionada}
            />

            <ResumenVentaModal
                visible={mostrarResumen}
                onClose={() => setMostrarResumen(false)}
                onConfirmar={confirmarVenta}
                venta={ventaTemporal}
            />

            <ConfirmarEntregaModal
                visible={mostrarResumenEntrega}
                onClose={() => setMostrarResumenEntrega(false)}
                onConfirmar={confirmarEntregaPedido}
                pedido={pedidoParaEntregar}
            />

            {/* Modal Cerrar Turno */}
            <Modal
                visible={mostrarModalCerrarTurno}
                animationType="fade"
                transparent={true}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCerrarTurno}>
                        <View style={styles.modalCerrarHeader}>
                            <Ionicons name="lock-closed" size={40} color="#dc3545" />
                            <Text style={styles.modalCerrarTitulo}>🔒 Cerrar Turno del Día</Text>
                        </View>

                        <View style={styles.modalCerrarBody}>
                            <Text style={styles.modalCerrarText}>¿Estás seguro de cerrar el turno?</Text>
                            <Text style={[styles.modalCerrarSubtext, { color: '#dc3545', fontWeight: 'bold' }]}>
                                ⚠️ ATENCIÓN: Una vez cerrado, NO podrás volver a abrirlo ni registrar más ventas para este día.
                            </Text>

                            {/* 🆕 Resumen Completo */}
                            {(totalVentasHoy > 0 || pedidosEntregadosHoy.length > 0) && (() => {
                                const totalPedidos = pedidosEntregadosHoy.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
                                const granTotal = totalDineroHoy + totalPedidos;

                                return (
                                    <View style={styles.modalCerrarResumen}>
                                        <View style={styles.modalCerrarFila}>
                                            <Text style={styles.modalCerrarLabel}>Ventas Ruta ({totalVentasHoy}):</Text>
                                            <Text style={styles.modalCerrarValor}>{formatearMoneda(totalDineroHoy)}</Text>
                                        </View>

                                        <View style={styles.modalCerrarFila}>
                                            <Text style={styles.modalCerrarLabel}>Pedidos ({pedidosEntregadosHoy.length}):</Text>
                                            <Text style={styles.modalCerrarValor}>{formatearMoneda(totalPedidos)}</Text>
                                        </View>

                                        {/* 🆕 Mostrar diferencia por precios especiales solo si existe */}
                                        {diferenciaPrecios > 0 && (
                                            <View style={[styles.modalCerrarFila, { marginTop: 8, backgroundColor: '#fff3cd', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 }]}>
                                                <Text style={[styles.modalCerrarLabel, { color: '#856404', fontSize: 13 }]}>💰 Venta Precios Especiales:</Text>
                                                <Text style={[styles.modalCerrarValor, { color: '#28a745', fontWeight: 'bold' }]}>+{formatearMoneda(diferenciaPrecios)}</Text>
                                            </View>
                                        )}

                                        <View style={[styles.modalCerrarFila, { marginTop: 10, borderTopWidth: 1, borderColor: '#eee', paddingTop: 10 }]}>
                                            <Text style={[styles.modalCerrarLabel, { fontWeight: 'bold', fontSize: 16 }]}>TOTAL A ENTREGAR:</Text>
                                            <Text style={[styles.modalCerrarValor, { fontWeight: 'bold', fontSize: 16, color: '#003d88' }]}>
                                                {formatearMoneda(granTotal)}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })()}
                        </View>

                        <View style={styles.modalCerrarBotones}>
                            <TouchableOpacity
                                style={[styles.modalCerrarBtn, styles.modalCancelarBtn]}
                                onPress={() => setMostrarModalCerrarTurno(false)}
                            >
                                <Text style={styles.modalCancelarTexto}>Cancelar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalCerrarBtn, styles.modalConfirmarBtn]}
                                onPress={() => {
                                    setMostrarModalCerrarTurno(false);
                                    handleCerrarTurno();
                                }}
                            >
                                <Ionicons name="lock-closed" size={18} color="white" />
                                <Text style={styles.modalConfirmarTexto}>Cerrar Turno</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            {/* 🆕 MODAL PEDIDOS ASIGNADOS */}
            <Modal
                visible={modalPedidosVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalPedidosVisible(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.65)' }]}>
                    <View style={[styles.modalContent, { maxHeight: '85%', width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <Text style={styles.modalTitle}>📦 Pedidos Asignados ({pedidosPendientes.length})</Text>
                            <TouchableOpacity onPress={() => setModalPedidosVisible(false)}>
                                <Ionicons name="close-circle" size={30} color="#666" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                            {pedidosPendientes.length === 0 ? (
                                <Text style={{ textAlign: 'center', color: '#666', marginTop: 20 }}>No tienes pedidos pendientes</Text>
                            ) : (
                                pedidosPendientes.map((p) => (
                                    <View key={p.id} style={[
                                        styles.pedidoCard,
                                        p.estado === 'ANULADA' && { backgroundColor: '#fff5f5', borderColor: '#dc3545', borderWidth: 2 }
                                    ]}>
                                        {/* Badge "No Entregado" si está anulado */}
                                        {p.estado === 'ANULADA' && (
                                            <View style={{ position: 'absolute', top: 15, left: '50%', transform: [{ translateX: -70 }], backgroundColor: '#dc3545', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, zIndex: 5, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 }}>
                                                <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5 }}>❌ NO ENTREGADO</Text>
                                            </View>
                                        )}
                                        {/* Botón X solo si NO está anulado */}
                                        {p.estado !== 'ANULADA' && (
                                            <TouchableOpacity
                                                style={styles.btnNovedadX}
                                                onPress={() => {
                                                    setPedidoEnNovedad(p);
                                                    setModalNovedadVisible(true);
                                                }}
                                            >
                                                <Ionicons name="close-circle" size={28} color="#dc3545" />
                                            </TouchableOpacity>
                                        )}

                                        <View style={styles.pedidoHeader}>
                                            <Text style={styles.pedidoCliente}>{p.destinatario || 'Cliente'}</Text>
                                            <Text style={styles.pedidoTotal}>${parseFloat(p.total).toLocaleString()}</Text>
                                        </View>
                                        <Text style={styles.pedidoInfo}>📍 {p.direccion_entrega || 'Sin dirección'}</Text>
                                        <Text style={styles.pedidoInfo}>📄 Pedido #{p.numero_pedido} • {p.fecha.split('T')[0]}</Text>
                                        <Text style={[styles.pedidoInfo, { fontStyle: 'italic' }]}>{p.nota}</Text>

                                        <View style={styles.pedidoDetallesBox}>
                                            {p.detalles.map((d, idx) => (
                                                <Text key={idx} style={styles.pedidoDetalleText}>
                                                    • {d.producto_nombre || 'Producto'} x{d.cantidad}
                                                </Text>
                                            ))}
                                        </View>

                                        {/* Botones solo si NO está anulado */}
                                        {p.estado !== 'ANULADA' && (
                                            <View style={styles.pedidoAccionesRow}>
                                                <TouchableOpacity
                                                    style={[styles.botonAccion, { backgroundColor: '#28a745', flex: 1, marginRight: 5 }]}
                                                    onPress={() => cargarPedidoEnCarrito(p)}
                                                >
                                                    <Ionicons name="cart" size={18} color="white" />
                                                    <Text style={styles.textoBotonAccion}>Vender (Carrito)</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={[styles.botonAccion, { backgroundColor: '#e9ecef', flex: 1, marginLeft: 5 }]}
                                                    onPress={() => marcarPedidoEntregado(p)}
                                                >
                                                    <Ionicons name="checkmark-done" size={18} color="#003d88" />
                                                    <Text style={[styles.textoBotonAccion, { color: '#003d88' }]}>Solo Entregar</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* 🆕 MODAL REPORTE NOVEDAD */}
            <Modal
                visible={modalNovedadVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setModalNovedadVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { width: '85%' }]}>
                        <Text style={[styles.modalTitle, { color: '#dc3545' }]}>⚠️ Reportar No Entrega</Text>
                        <Text style={{ marginBottom: 10, color: '#666' }}>
                            ¿Por qué no se entregó el pedido de {pedidoEnNovedad?.destinatario}?
                        </Text>

                        <TextInput
                            style={{
                                borderWidth: 1,
                                borderColor: '#ccc',
                                borderRadius: 8,
                                padding: 10,
                                height: 80,
                                textAlignVertical: 'top',
                                marginBottom: 15,
                                backgroundColor: '#f9f9f9'
                            }}
                            placeholder="Escribe el motivo (ej: Cerrado, Sin dinero...)"
                            value={motivoNovedad}
                            onChangeText={setMotivoNovedad}
                            multiline
                            autoFocus
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                            <TouchableOpacity
                                style={[styles.botonAccion, { backgroundColor: '#e9ecef', paddingHorizontal: 20 }]}
                                onPress={() => setModalNovedadVisible(false)}
                            >
                                <Text style={{ color: '#666', fontWeight: 'bold' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.botonAccion, { backgroundColor: '#dc3545', paddingHorizontal: 20 }]}
                                onPress={confirmarNovedad}
                            >
                                <Text style={{ color: 'white', fontWeight: 'bold' }}>Reportar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            {/* 🆕 MODAL NOTAS CLIENTE */}
            <ClienteNotaModal
                visible={mostrarNotaModal}
                onClose={() => setMostrarNotaModal(false)}
                cliente={clienteSeleccionado}
                onGuardar={handleNotaGuardada}
            />
            {/* 🆕 MODAL HISTORIAL VENTAS */}
            <Modal
                visible={mostrarHistorialVentas}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setMostrarHistorialVentas(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
                    <View style={[styles.modalContent, { maxHeight: '80%', width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 15 }}>
                            <TouchableOpacity onPress={() => setMostrarHistorialVentas(false)}>
                                <Ionicons name="close-circle" size={30} color="#666" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                            {cargandoHistorial && (
                                <Text style={{ textAlign: 'center', color: '#666', marginBottom: 10 }}>Cargando historial...</Text>
                            )}

                            {historialReimpresion.length === 0 ? (
                                <Text style={{ textAlign: 'center', color: '#666', marginTop: 20 }}>No hay ventas registradas hoy</Text>
                            ) : (
                                historialReimpresion.map((venta) => {
                                    const esAnulada = venta.estado === 'ANULADA';
                                    return (
                                        <View key={venta._key || `${venta.id}-${venta.fecha}`} style={{
                                            backgroundColor: esAnulada ? '#f5f5f5' : (venta.editada ? '#fff5f5' : '#f8f9fa'),
                                            padding: 15,
                                            borderRadius: 10,
                                            marginBottom: 10,
                                            borderWidth: esAnulada ? 1 : (venta.editada ? 2 : 1),
                                            borderColor: esAnulada
                                                ? '#aaa'
                                                : venta.editada
                                                    ? '#e74c3c'
                                                    : venta.origen === 'PEDIDO_FACTURADO' ? '#f59e0b' : '#dee2e6',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            opacity: esAnulada ? 0.65 : 1
                                        }}>
                                            <View style={{ flex: 1 }}>
                                                {/* Badges */}
                                                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                                                    {esAnulada && (
                                                        <View style={{ alignSelf: 'flex-start', backgroundColor: '#6c757d', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>🚫 ANULADA</Text>
                                                        </View>
                                                    )}
                                                    {venta.origen === 'PEDIDO_FACTURADO' && !esAnulada && (
                                                        <View style={{ alignSelf: 'flex-start', backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>PEDIDO</Text>
                                                        </View>
                                                    )}
                                                    {venta.editada && !esAnulada && (
                                                        <View style={{ alignSelf: 'flex-start', backgroundColor: '#e74c3c', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>✏️ EDITADA</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={{ fontWeight: 'bold', fontSize: 16, color: esAnulada ? '#888' : '#333' }}>
                                                    {venta.cliente_negocio || venta.cliente_nombre || 'Cliente General'}
                                                </Text>
                                                <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                                                    {venta.fecha ? new Date(venta.fecha).toLocaleTimeString() : 'Hora desconocida'}
                                                    {venta.metodo_pago ? ` • ${venta.metodo_pago}` : ''}
                                                </Text>
                                                <Text style={{ fontSize: 15, fontWeight: 'bold', color: esAnulada ? '#aaa' : (venta.editada ? '#e74c3c' : '#00ad53'), marginTop: 4, textDecorationLine: esAnulada ? 'line-through' : 'none' }}>
                                                    {formatearMoneda(Math.round(parseFloat(venta.total) || 0))}
                                                </Text>
                                            </View>

                                            {/* Botones: Anular + Editar + Imprimir */}
                                            <View style={{ flexDirection: 'column', gap: 8, marginLeft: 10 }}>
                                                {/* Botón anular — solo si es de ruta, tiene ID real y no está anulada */}
                                                {venta.origen !== 'PEDIDO_FACTURADO' && !esAnulada && venta.id && !String(venta._key || '').startsWith('local-') && (
                                                    <TouchableOpacity
                                                        style={{ backgroundColor: '#dc3545', padding: 10, borderRadius: 8 }}
                                                        onPress={() => anularVentaRuta(venta)}
                                                    >
                                                        <Ionicons name="ban-outline" size={20} color="white" />
                                                    </TouchableOpacity>
                                                )}
                                                {/* Botón editar — solo si tiene detalles, no es pedido y no está anulada */}
                                                {venta.origen !== 'PEDIDO_FACTURADO' && !esAnulada && (
                                                    <TouchableOpacity
                                                        style={{ backgroundColor: '#f39c12', padding: 10, borderRadius: 8 }}
                                                        onPress={() => abrirEdicionVenta(venta)}
                                                    >
                                                        <Ionicons name="create-outline" size={20} color="white" />
                                                    </TouchableOpacity>
                                                )}
                                                {/* Botón imprimir — siempre visible */}
                                                <TouchableOpacity
                                                    style={{ backgroundColor: esAnulada ? '#aaa' : '#003d88', padding: 10, borderRadius: 8 }}
                                                    onPress={() => imprimirTicket(venta)}
                                                >
                                                    <Ionicons name="print" size={20} color="white" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })

                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* 🆕 MODAL EDICIÓN DE VENTA */}
            <Modal
                visible={modalEdicionVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => {
                    setModalEdicionVisible(false);
                    setMostrarHistorialVentas(true);
                }}
            >
                <KeyboardAvoidingView style={[styles.modalOverlay, { justifyContent: 'flex-end' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={{
                        backgroundColor: '#fff',
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        padding: 20,
                        maxHeight: '90%',
                        flexShrink: 1,
                    }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <View>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>✏️ Editar Venta</Text>
                                <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                                    {ventaEnEdicion?.cliente_negocio || ventaEnEdicion?.cliente_nombre || 'Cliente'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => {
                                setModalEdicionVisible(false);
                                setMostrarHistorialVentas(true);
                            }}>
                                <Ionicons name="close-circle" size={30} color="#999" />
                            </TouchableOpacity>
                        </View>

                        <Text style={{ fontSize: 12, color: '#e74c3c', marginBottom: 12, fontStyle: 'italic' }}>
                            ⚠️ Modifica las cantidades. El stock y el Cargue se ajustarán automáticamente.
                        </Text>

                        <ScrollView
                            style={{ flexShrink: 1, maxHeight: 400 }}
                            contentContainerStyle={{ paddingBottom: 20 }}
                            keyboardShouldPersistTaps="handled"
                        >
                            {Object.entries(carritoEdicion).map(([nombre, item]) => (
                                <View key={nombre} style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: 12,
                                    backgroundColor: '#f8f9fa',
                                    borderRadius: 8,
                                    marginBottom: 8,
                                    borderWidth: 1,
                                    borderColor: '#e9ecef',
                                }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#333' }}>{nombre}</Text>
                                        <Text style={{ fontSize: 12, color: '#666' }}>
                                            {formatearMoneda(item.precio)} c/u
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        {/* Decrementar */}
                                        <TouchableOpacity
                                            style={{ backgroundColor: '#e74c3c', borderRadius: 6, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }}
                                            onPress={() => cambiarCantidadEdicion(nombre, item.cantidad - 1)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', lineHeight: 22 }}>−</Text>
                                        </TouchableOpacity>
                                        {/* Input cantidad */}
                                        <TextInput
                                            style={{
                                                borderWidth: 1, borderColor: '#ced4da', borderRadius: 6,
                                                width: 48, textAlign: 'center', fontSize: 16, fontWeight: 'bold',
                                                paddingVertical: 4, color: '#333'
                                            }}
                                            keyboardType="numeric"
                                            value={String(item.cantidad)}
                                            onChangeText={(val) => cambiarCantidadEdicion(nombre, val)}
                                            selectTextOnFocus={true} /* 🆕 Auto-selecciona el numero al hacer click */
                                        />
                                        {/* Incrementar */}
                                        <TouchableOpacity
                                            style={{ backgroundColor: '#00ad53', borderRadius: 6, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }}
                                            onPress={() => cambiarCantidadEdicion(nombre, item.cantidad + 1)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', lineHeight: 22 }}>+</Text>
                                        </TouchableOpacity>
                                        {/* Subtotal */}
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#003d88', minWidth: 70, textAlign: 'right' }}>
                                            {formatearMoneda(item.precio * item.cantidad)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        {/* Total actualizado */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e9ecef' }}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>NUEVO TOTAL</Text>
                            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#e74c3c' }}>
                                {formatearMoneda(Math.round(
                                    Object.values(carritoEdicion).reduce((sum, i) => sum + (i.precio * i.cantidad), 0)
                                ))}
                            </Text>
                        </View>

                        {/* Botones */}
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: '#6c757d', padding: 14, borderRadius: 10, alignItems: 'center' }}
                                onPress={() => {
                                    setModalEdicionVisible(false);
                                    setMostrarHistorialVentas(true);
                                }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ flex: 2, backgroundColor: cargandoEdicion ? '#aaa' : '#e74c3c', padding: 14, borderRadius: 10, alignItems: 'center' }}
                                onPress={confirmarEdicionVenta}
                                disabled={cargandoEdicion}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>
                                    {cargandoEdicion ? 'Guardando...' : '✅ Guardar Edición'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* 🆕 Modal Turno Ya Cerrado (se muestra cuando backend reabrió un turno cerrado) */}
            <Modal
                visible={mostrarModalTurnoCerrado}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setMostrarModalTurnoCerrado(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContentCentered}>
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <Ionicons name="warning" size={60} color="#FF6B6B" />
                        </View>

                        <Text style={[styles.modalTitle, { textAlign: 'center', color: '#FF6B6B' }]}>
                            ⚠️ TURNO YA CERRADO
                        </Text>

                        <Text style={{ fontSize: 16, color: '#555', textAlign: 'center', marginBottom: 8, marginTop: 12 }}>
                            El turno del {fechaTurnoCerrado} ya fue cerrado anteriormente.
                        </Text>

                        <Text style={{ fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 24, fontStyle: 'italic' }}>
                            El stock puede estar en cero. ¿Deseas continuar de todas formas?
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                            <TouchableOpacity
                                style={[styles.btnModal, { backgroundColor: '#E74C3C', flex: 1 }]}
                                onPress={() => {
                                    setMostrarModalTurnoCerrado(false);
                                    navigation.navigate('Options', { userId, vendedorNombre });
                                }}
                            >
                                <Ionicons name="close-circle" size={20} color="#FFF" />
                                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600', marginLeft: 8 }}>
                                    Cancelar
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.btnModal, { backgroundColor: '#27AE60', flex: 1 }]}
                                onPress={async () => {
                                    setMostrarModalTurnoCerrado(false);
                                    console.log('🔓 Reabriendo turno con forzar=true...');

                                    // Llamar al backend con forzar=true para reabrir
                                    try {
                                        const controllerReopen = new AbortController();
                                        const timeoutReopen = setTimeout(() => controllerReopen.abort(), 10000);
                                        const headersAuth = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });

                                        const resp = await fetch(ENDPOINTS.TURNO_ABRIR, {
                                            method: 'POST',
                                            headers: headersAuth,
                                            body: JSON.stringify({
                                                vendedor_id: userId,
                                                vendedor_nombre: vendedorNombre || `Vendedor ${userId}`,
                                                dia: diaSeleccionado,
                                                fecha: fechaTurnoCerrado,
                                                dispositivo: Platform.OS,
                                                forzar: true
                                            }),
                                            signal: controllerReopen.signal
                                        });
                                        clearTimeout(timeoutReopen);
                                        const respData = await resp.json();
                                        console.log('✅ Turno reabierto:', respData);
                                    } catch (err) {
                                        console.log('⚠️ Error reabriendo turno:', err);
                                    }

                                    // Abrir turno localmente
                                    setTurnoAbierto(true);
                                    setHoraTurno(new Date());

                                    // Cargar stock y pedidos
                                    await cargarStockCargue(diaSeleccionado, new Date(fechaTurnoCerrado));
                                    await verificarPedidosPendientes(fechaTurnoCerrado);

                                    cargarDatos();
                                    verificarPendientes();
                                    precargarClientesEnCache();
                                }}
                            >
                                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600', marginLeft: 8 }}>
                                    Continuar
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    modalSyncOverlay: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 78,
        backgroundColor: 'rgba(0,0,0,0.12)',
    },
    modalSyncCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#c8e6c9',
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
    },
    modalSyncTexto: {
        color: '#155724',
        fontSize: 13,
        fontWeight: '700',
    },
    // 🆕 Estilos Banner Conectividad
    bannerOffline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: '#e65100',
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    bannerSincronizando: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: '#1565c0',
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    bannerExito: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: '#2e7d32',
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    bannerTexto: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    // 🆕 Badge "Vendido" en header del cliente — identical al del selector de clientes
    badgeYaVendidoHeader: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#00ad53',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeYaVendidoHeaderTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    btnNovedadX: {
        position: 'absolute',
        top: 0,
        right: 0,
        zIndex: 10,
        padding: 5,
    },
    // 🆕 Estilos Pedidos
    btnPedidosFlotante: {
        backgroundColor: '#00ad53', // Verde App
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10, // Más compacto
        paddingHorizontal: 15,
        marginHorizontal: 15,
        marginBottom: 10, // Menos espacio
        marginTop: 5,
        borderRadius: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
    },
    btnPedidosTexto: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 15, // Texto un poco más pequeño
        marginLeft: 10,
        flex: 1,
    },
    pedidoCard: {
        backgroundColor: '#f8f9fa',
        padding: 15,
        borderRadius: 10,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#dee2e6',
    },
    pedidoHeader: {
        marginBottom: 8,
        paddingRight: 40, // Espacio para la X
    },
    pedidoCliente: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#212529',
        marginBottom: 4,
    },
    pedidoTotal: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#28a745',
    },
    pedidoInfo: {
        color: '#6c757d',
        marginBottom: 2,
        fontSize: 14,
    },
    pedidoDetallesBox: {
        marginTop: 10,
        padding: 10,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e9ecef',
    },
    pedidoDetalleText: {
        color: '#495057',
        fontSize: 14,
        marginBottom: 2,
    },
    pedidoAccionesRow: {
        flexDirection: 'row',
        marginTop: 15,
    },
    botonAccion: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    textoBotonAccion: {
        fontWeight: 'bold',
        marginLeft: 5,
        fontSize: 14,
    },
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    headerCliente: {
        backgroundColor: 'white',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerClienteCompacto: {
        paddingVertical: 4,
        paddingHorizontal: 10,
    },
    clienteSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#f0f8ff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#003d88',
        position: 'relative',
    },
    clienteSelectorCompacto: {
        paddingVertical: 6,
    },
    headerCheckVendido: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#00ad53',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    headerTextoVendido: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    headerXPedido: {
        position: 'absolute',
        top: 18,
        right: 20,
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    clienteInfo: {
        marginLeft: 10,
        flex: 1,
    },
    clienteNombre: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#003d88',
    },
    clienteNombreMedio: {
        fontSize: 14,
    },
    clienteNombreLargo: {
        fontSize: 13,
    },
    clienteDetalle: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    badgeEntregado: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#22c55e',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeEntregadoTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    badgePendienteHeader: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#ff9800',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgePendienteHeaderTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    badgeVendido: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#00ad53',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeVendidoTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    badgeNoEntregado: {
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: '#dc3545',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeNoEntregadoTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    badgeTipoHeaderPedido: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#6f42c1',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'white',
    },
    badgeTipoHeaderRuta: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#003d88',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'white',
    },
    badgeTipoHeaderTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    busquedaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingVertical: 0,
        paddingHorizontal: 10,
        marginHorizontal: 2, // Reducido al mínimo para quitar gris lateral
        marginTop: 2,
        marginBottom: 2, // Reduzco margen para que se vea menos fondo gris
        borderRadius: 16,
        height: 38,
        borderWidth: 1,
        borderColor: 'white',
        elevation: 0, // Asegurar que no haya sombra
    },
    iconoBusqueda: {
        marginRight: 6,
    },
    inputBusqueda: {
        flex: 1,
        fontSize: 14,
        padding: 0,
        height: '100%',
        color: '#000',
        marginTop: 0, // Reset por seguridad
        paddingVertical: 0, // Reset por seguridad
    },
    listaProductos: {
        flex: 1,
    },
    listaContent: {
        padding: 10,
    },
    listaContentNormal: {
        paddingBottom: 260,
    },
    listaContentConTeclado: {
        paddingBottom: 620,
    },
    productoItem: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#66b3ff',
        elevation: 1,
    },
    productoInfo: {
        flex: 1,
    },
    productoNombre: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    productoPrecio: {
        fontSize: 12,
        color: '#666',
    },
    stockTexto: {
        fontSize: 12,
        color: '#666',
        fontWeight: 'normal',
    },
    productoSubtotal: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#00ad53',
        marginTop: 4,
    },
    cantidadControl: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    btnCantidad: {
        backgroundColor: '#00ad53',
        borderRadius: 6,
        padding: 8,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnDeshabilitado: {
        backgroundColor: '#ccc',
    },
    inputCantidad: {
        width: 50,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 'bold',
        marginHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#66b3ff',
        paddingVertical: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
        marginTop: 10,
    },
    emptySubtext: {
        fontSize: 12,
        color: '#bbb',
        marginTop: 5,
    },
    pendientesBar: {
        backgroundColor: '#ff9800',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        gap: 8,
    },
    pendientesText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 10,
    },
    footer: {
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        padding: 15,
        paddingBottom: Platform.OS === 'android' ? 40 : 15,
    },
    btnCompletar: {
        backgroundColor: '#00ad53',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        borderRadius: 10,
    },
    iconoBoton: {
        marginRight: 8,
    },
    btnCompletarTexto: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    botonesAccionesContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 10,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    btnAccion: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        gap: 6,
    },
    btnVencidas: {
        backgroundColor: '#ff6b6b', // Rojo para advertencia
    },
    manijaRevelarTurno: {
        height: 12,
        width: '100%',
        backgroundColor: '#f8f9fa',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    manijaIndicador: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#dee2e6',
    },
    turnoIndicadorForzado: {
        elevation: 4,
    },
    btnEditar: {
        backgroundColor: '#dc3545', // Rojo
    },
    btnEntregado: {
        backgroundColor: '#28a745', // Verde
    },
    btnAccionTexto: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    badgeAccion: {
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginLeft: 4,
    },
    badgeTexto: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    // 🆕 Estilos botón Cerrar Turno pequeño
    btnCerrarPequeño: {
        backgroundColor: '#003d88', // Azul de la app
    },
    // 🆕 Estilos sección cerrar turno (expandida)
    seccionCerrarTurno: {
        marginTop: 15,
        backgroundColor: '#fff3cd',
        borderRadius: 10,
        padding: 15,
        borderWidth: 2,
        borderColor: '#dc3545',
    },
    resumenDia: {
        marginBottom: 12,
    },
    resumenTitulo: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#dc3545',
        marginBottom: 8,
    },
    resumenFila: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 4,
    },
    resumenLabel: {
        fontSize: 14,
        color: '#666',
    },
    resumenValor: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    btnCerrarTurnoGrande: {
        backgroundColor: '#dc3545',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        borderRadius: 10,
        gap: 8,
    },
    btnCerrarTurnoTexto: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Estilos Modal Selección de Día
    modalDiaOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalDiaContainer: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        width: '90%',
        maxWidth: 320,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    modalDiaHeader: {
        alignItems: 'center',
        marginBottom: 15,
    },
    modalDiaTitulo: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#003d88',
        marginTop: 10,
    },
    modalDiaSubtitulo: {
        fontSize: 12,
        color: '#666',
        marginTop: 3,
    },
    modalDiaBotones: {
        gap: 8,
    },
    modalDiaBoton: {
        backgroundColor: '#f0f8ff',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#003d88',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalDiaBotonHoy: {
        backgroundColor: '#003d88',
    },
    modalDiaBotonTexto: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#003d88',
    },
    modalDiaBotonTextoHoy: {
        color: 'white',
    },
    modalDiaHoyLabel: {
        backgroundColor: '#00ad53',
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 10,
    },
    // 🆕 Estilos botón Volver
    modalDiaBotonVolver: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
    },
    modalDiaVolverTexto: {
        fontSize: 14,
        color: '#666',
        marginLeft: 8,
    },
    // Estilos Modal Cerrar Turno
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCerrarTurno: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        width: '90%',
        maxWidth: 400,
    },
    modalCerrarHeader: {
        alignItems: 'center',
        marginBottom: 20,
    },
    modalCerrarTitulo: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#dc3545',
        marginTop: 10,
        textAlign: 'center',
    },
    modalCerrarBody: {
        marginBottom: 20,
    },
    modalCerrarText: {
        fontSize: 16,
        color: '#333',
        textAlign: 'center',
        marginBottom: 8,
    },
    modalCerrarSubtext: {
        fontSize: 13,
        color: '#666',
        textAlign: 'center',
        marginBottom: 15,
    },
    modalCerrarResumen: {
        backgroundColor: '#f8f9fa',
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#dee2e6',
    },
    modalCerrarFila: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 5,
    },
    modalCerrarLabel: {
        fontSize: 14,
        color: '#666',
    },
    modalCerrarValor: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    modalCerrarBotones: {
        flexDirection: 'row',
        gap: 10,
    },
    modalCerrarBtn: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        borderRadius: 8,
        gap: 6,
    },
    modalCancelarBtn: {
        backgroundColor: '#6c757d',
    },
    modalCancelarTexto: {
        color: 'white',
        fontSize: 15,
        fontWeight: 'bold',
    },
    modalConfirmarBtn: {
        backgroundColor: '#dc3545',
    },
    modalConfirmarTexto: {
        color: 'white',
        fontSize: 15,
        fontWeight: 'bold',
    },
    // 🆕 Estilos para indicador de turno
    turnoIndicador: {
        backgroundColor: '#ecfdf5',
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#d1fae5',
    },
    turnoCerrado: {
        backgroundColor: '#f3f4f6',
        borderBottomColor: '#e5e7eb',
    },
    turnoIndicadorContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    puntoVerde: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#22c55e',
    },
    puntoGris: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#9ca3af',
    },
    turnoTexto: {
        fontSize: 13,
        fontWeight: '700',
        color: '#166534',
    },
    turnoHora: {
        fontSize: 12,
        color: '#16a34a',
    },
    turnoDia: {
        fontSize: 12,
        fontWeight: '500',
        color: '#059669',
        flexShrink: 1, // Evitar desbordamiento
    },
    // 🆕 Estilos para pantalla de carga
    cargandoOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    cargandoContainer: {
        backgroundColor: 'white',
        padding: 30,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    cargandoTexto: {
        marginTop: 12,
        fontSize: 16,
        color: '#003d88',
        fontWeight: '500',
    },
    // 🆕 Estilos para botones de turno
    btnCambiarDia: {
        padding: 6,
        backgroundColor: '#e0f2fe',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    btnAbrirTurno: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#003d88',
        borderRadius: 6,
    },
    btnAbrirTurnoTexto: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    btnAbrirTurnoTexto: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    // 🆕 Estilos Botón Nota
    btnNotaCliente: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        marginLeft: 8,
        backgroundColor: '#e6f7ff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#91d5ff',
        position: 'relative'
    },
    btnNotaClienteTexto: {
        fontSize: 12,
        color: '#003d88',
        fontWeight: 'bold',
        marginLeft: 4
    },
    puntoNotificacion: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ff4d4f',
        borderWidth: 1,
        borderColor: 'white'
    },
    // 🆕 Estilos Icono Nota
    btnNotaIcono: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
        backgroundColor: '#fffbe6', // Amarillo suave
        borderRadius: 22, // Circular
        borderWidth: 1,
        borderColor: '#ffe58f',
        position: 'relative'
    },
    puntoNotificacionIcono: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#ff4d4f',
        borderWidth: 2,
        borderColor: 'white'
    },
    // 🆕 Estilos Botón Interno
    btnNotaInterno: {
        padding: 5,
        marginHorizontal: 5,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative'
    },
    puntoNotificacionInterno: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ff4d4f',
        borderWidth: 1.5,
        borderColor: '#f0f8ff' // Mismo que fondo card
    },
    // 🆕 Estilos Modal Turno Cerrado
    modalContent: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 24,
        width: '85%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalContentCentered: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 24,
        width: '85%',
        maxWidth: 400,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    btnModal: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default VentasScreen;
