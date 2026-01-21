import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Modal,
    ActivityIndicator,
    SectionList,
    Linking, // 🆕 Importar Linking
    Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config';

// Mapeo de días
const DIAS_SEMANA = {
    0: 'DOMINGO',
    1: 'LUNES',
    2: 'MARTES',
    3: 'MIERCOLES',
    4: 'JUEVES',
    5: 'VIERNES',
    6: 'SABADO'
};

// Keys para cache
const CACHE_KEY_CLIENTES = 'clientes_cache_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 horas

const ClienteSelector = ({
    visible,
    onClose,
    onSelectCliente,
    onNuevoCliente,
    userId,
    diaSeleccionado,
    ventasDelDia = [],
    pedidosPendientes = [], // 🆕 Lista de pedidos pendientes
    pedidosEntregadosHoy = [], // 🆕 Lista de pedidos entregados hoy
    pedidosNoEntregadosHoy = [], // 🆕 Lista de pedidos no entregados hoy
    onCargarPedido, // 🆕 Función para cargar pedido en carrito
    onMarcarEntregado, // 🆕 Función para marcar pedido como entregado
    onMarcarNoEntregado // 🆕 Función para marcar pedido como no entregado
}) => {
    const [clientesDelDia, setClientesDelDia] = useState([]);
    const [todosLosClientes, setTodosLosClientes] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(false);
    const [mostrarTodos, setMostrarTodos] = useState(false);
    const [diaActual, setDiaActual] = useState('');
    const [actualizandoEnFondo, setActualizandoEnFondo] = useState(false);
    // 🆕 Estados para Drag & Drop
    const [modoOrdenar, setModoOrdenar] = useState(false);
    const [guardandoOrden, setGuardandoOrden] = useState(false);
    const [rutaId, setRutaId] = useState(null);

    // 🆕 Ref para acceder al estado actual en funciones asíncronas
    const modoOrdenarRef = React.useRef(modoOrdenar);

    useEffect(() => {
        modoOrdenarRef.current = modoOrdenar;
    }, [modoOrdenar]);

    // 🆕 Obtener rutaId del vendedor
    const obtenerRutaId = async () => {
        try {
            const response = await fetch(`${API_URL}/api/rutas/?vendedor_id=${userId}`);
            if (response.ok) {
                const rutas = await response.json();
                if (rutas.length > 0) {
                    setRutaId(rutas[0].id);
                    console.log('📍 RutaId obtenida:', rutas[0].id);
                    return rutas[0].id;
                }
            }
        } catch (error) {
            console.error('Error obteniendo rutaId:', error);
        }
        return null;
    };

    // 🆕 Guardar orden de clientes después de drag & drop
    const guardarOrdenClientes = async (nuevoOrden) => {
        if (!rutaId || !diaActual) {
            console.log('⚠️ No se puede guardar: falta rutaId o día');
            return;
        }

        setGuardandoOrden(true);
        try {
            const clientesIds = nuevoOrden.map(c => parseInt(c.id));
            console.log('💾 Guardando orden para día:', diaActual, 'IDs:', clientesIds);

            const response = await fetch(`${API_URL}/api/ruta-orden/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ruta_id: rutaId,
                    dia: diaActual,
                    clientes_ids: clientesIds
                })
            });

            if (response.ok) {
                console.log('✅ Orden guardado exitosamente');

                // 🆕 Actualizar caché localmente para evitar reversiones
                const cacheKey = `${CACHE_KEY_CLIENTES}${userId}`;
                // Necesitamos actualizar todo el caché, pero solo tenemos el orden de HOY.
                // Es complejo actualizar solo una parte. 
                // Mejor estrategia: No hacer nada complejo aquí, confiar en el estado local.
            } else {
                console.error('❌ Error al guardar orden:', response.status);
            }
        } catch (error) {
            console.error('❌ Error guardando orden:', error);
        } finally {
            setGuardandoOrden(false);
        }
    };

    // 🆕 Mover cliente con flechas (Arriba/Abajo)
    // 🆕 Mover cliente con flechas (Arriba/Abajo)
    const moverCliente = (index, direccion) => {
        // Usar callback del setter para asegurar que trabajamos con el estado más reciente
        setClientesDelDia(prevClientes => {
            const nuevaLista = [...prevClientes];
            const nuevoIndex = index + direccion;

            // Validar límites
            if (nuevoIndex < 0 || nuevoIndex >= nuevaLista.length) {
                console.log('⚠️ Movimiento inválido (fuera de límites)');
                return prevClientes;
            }

            console.log(`🔄 Moviendo: ${nuevaLista[index].negocio} -> Posición ${nuevoIndex}`);

            // Intercambiar elementos
            const clienteMovido = nuevaLista[index];
            const clienteDesplazado = nuevaLista[nuevoIndex];

            nuevaLista[index] = clienteDesplazado;
            nuevaLista[nuevoIndex] = clienteMovido;

            // Guardar en servidor (fuera del ciclo de render inmediato)
            setTimeout(() => guardarOrdenClientes(nuevaLista), 0);

            return nuevaLista;
        });
    };

    // 🆕 Mover cliente al extremo (Inicio o Fin) con Long Press
    const moverClienteAlExtremo = (index, lugar) => {
        if (busqueda.trim() !== '') return;

        setClientesDelDia(prevClientes => {
            const nuevaLista = [...prevClientes];
            const [clienteMovido] = nuevaLista.splice(index, 1);

            if (lugar === 'inicio') {
                nuevaLista.unshift(clienteMovido);
            } else {
                nuevaLista.push(clienteMovido);
            }

            setTimeout(() => guardarOrdenClientes(nuevaLista), 0);
            return nuevaLista;
        });
    };



    // 🆕 Lógica para Movimiento Rápido (Hold & Scroll Number)
    const [dragTarget, setDragTarget] = useState(null); // { original: 1, destino: 5 }
    const dragTargetRef = useRef(null); // 🆕 Referencia para precisión absoluta
    const rapidIntervalRef = useRef(null);
    const pressTimeoutRef = useRef(null); // Para diferenciar Tap de Hold

    const startRapidMove = (index, direccion) => {
        // Delay inicial para diferenciar TAP de HOLD
        pressTimeoutRef.current = setTimeout(() => {
            // Empezar modo HOLD
            const inicio = { original: index, destino: index + direccion };
            setDragTarget(inicio);
            dragTargetRef.current = inicio;

            rapidIntervalRef.current = setInterval(() => {
                if (!dragTargetRef.current) return;

                let nuevoDestino = dragTargetRef.current.destino + direccion;
                // Límites
                if (nuevoDestino < 0) nuevoDestino = 0;
                if (nuevoDestino >= clientesDelDia.length) nuevoDestino = clientesDelDia.length - 1;

                const nuevoEstado = { ...dragTargetRef.current, destino: nuevoDestino };
                dragTargetRef.current = nuevoEstado;
                setDragTarget(nuevoEstado); // Disparar render
            }, 850); // 🆕 Velocidad MUY controlada
        }, 300); // Tiempo para considerar "Hold"
    };

    const stopRapidMove = (index, direccion) => {
        // Limpiar timers
        if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
        if (rapidIntervalRef.current) clearInterval(rapidIntervalRef.current);

        // Usar la referencia para máxima precisión
        const target = dragTargetRef.current;

        if (target) {
            // Fue un HOLD: Mover al destino final exacto
            if (target.original !== target.destino) {
                moverClienteDirecto(target.original, target.destino);
            }
            setDragTarget(null);
            dragTargetRef.current = null;
        } else {
            // Fue un TAP rápido: Mover solo 1 posición
            moverCliente(index, direccion);
        }
    };

    const moverClienteDirecto = (fromIndex, toIndex) => {
        setClientesDelDia(prevClientes => {
            const nuevaLista = [...prevClientes];
            const [clienteMovido] = nuevaLista.splice(fromIndex, 1);
            nuevaLista.splice(toIndex, 0, clienteMovido);

            // Reasignar orden
            const listaReordenada = nuevaLista.map((c, i) => ({ ...c, orden: i + 1 }));

            setTimeout(() => guardarOrdenClientes(listaReordenada), 0);
            return listaReordenada;
        });
    };

    useEffect(() => {
        if (visible) {
            // Usar el día seleccionado o el día actual
            const dia = diaSeleccionado || DIAS_SEMANA[new Date().getDay()];
            setDiaActual(dia);
            cargarClientesConCache(dia);
            obtenerRutaId();
            setModoOrdenar(false); // Resetear modo ordenar al abrir
        }
    }, [visible, diaSeleccionado]);

    // 🆕 Cargar clientes primero del cache, luego actualizar desde servidor
    const cargarClientesConCache = async (dia) => {
        setLoading(true);

        try {
            // 1. Intentar cargar del cache primero (INSTANTÁNEO)
            const cacheKey = `${CACHE_KEY_CLIENTES}${userId}`;
            const cachedData = await AsyncStorage.getItem(cacheKey);

            if (cachedData) {
                const { clientes, timestamp } = JSON.parse(cachedData);
                const esValido = (Date.now() - timestamp) < CACHE_EXPIRY;

                if (clientes && clientes.length > 0) {
                    console.log('📦 Clientes cargados del cache:', clientes.length);

                    // Filtrar clientes del día
                    const clientesHoy = clientes.filter(c =>
                        c.dia_visita?.toUpperCase().includes(dia)
                    );

                    setClientesDelDia(clientesHoy);
                    setTodosLosClientes(clientes);
                    setLoading(false);

                    // Si el cache es válido, actualizar en segundo plano
                    if (esValido) {
                        actualizarClientesEnFondo(dia, cacheKey);
                        return;
                    }
                }
            }

            // 2. Si no hay cache o expiró, cargar del servidor
            await cargarClientesDelServidor(dia);

        } catch (error) {
            console.error('Error con cache:', error);
            await cargarClientesDelServidor(dia);
        }
    };

    // 🆕 Actualizar clientes en segundo plano sin bloquear UI
    const actualizarClientesEnFondo = async (dia, cacheKey) => {
        setActualizandoEnFondo(true);
        try {
            // 🆕 Incluir día en la petición para que el servidor ordene correctamente
            const urlTodos = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}&dia=${dia}`;
            const response = await fetch(urlTodos);

            if (response.ok) {
                const data = await response.json();

                // 🛑 Si el usuario activó el modo ordenar mientras cargábamos, NO sobrescribir
                if (modoOrdenarRef.current) {
                    console.log('⛔ Omitiendo actualización de fondo (Modo ordenar activo)');
                    return;
                }

                const clientesFormateados = data.map((c, index) => ({
                    id: c.id.toString(),
                    nombre: c.nombre_contacto || c.nombre_negocio,
                    negocio: c.nombre_negocio,
                    celular: c.telefono || '',
                    direccion: c.direccion || '',
                    dia_visita: c.dia_visita,
                    nota: c.nota,
                    tipo_negocio: c.tipo_negocio,
                    orden: index + 1, // 🆕 El orden viene del servidor
                    esDeRuta: true
                }));

                // Guardar en cache
                await AsyncStorage.setItem(cacheKey, JSON.stringify({
                    clientes: clientesFormateados,
                    timestamp: Date.now()
                }));

                // 🆕 Los clientes ya vienen filtrados y ordenados por día del servidor
                setClientesDelDia(clientesFormateados);

                // También cargar todos sin filtro de día
                const urlTodosSinFiltro = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}`;
                const responseTodos = await fetch(urlTodosSinFiltro);
                if (responseTodos.ok) {
                    const dataTodos = await responseTodos.json();
                    setTodosLosClientes(dataTodos.map(c => ({
                        id: c.id.toString(),
                        nombre: c.nombre_contacto || c.nombre_negocio,
                        negocio: c.nombre_negocio,
                        celular: c.telefono || '',
                        direccion: c.direccion || '',
                        dia_visita: c.dia_visita,
                        nota: c.nota,
                        tipo_negocio: c.tipo_negocio,
                        esDeRuta: true
                    })));
                }

                console.log('✅ Clientes actualizados en segundo plano. Orden del día:', dia);
            }
        } catch (error) {
            console.log('⚠️ Error actualizando en fondo:', error.message);
        } finally {
            setActualizandoEnFondo(false);
        }
    };

    // 🆕 Cargar clientes del servidor (con timeout largo)
    const cargarClientesDelServidor = async (dia) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos

            try {
                // 🆕 Cargar clientes del día actual (ya ordenados por el servidor)
                const urlDia = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}&dia=${dia}`;
                const response = await fetch(urlDia, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    const clientesDelDiaFormateados = data.map((c, index) => ({
                        id: c.id.toString(),
                        nombre: c.nombre_contacto || c.nombre_negocio,
                        negocio: c.nombre_negocio,
                        celular: c.telefono || '',
                        direccion: c.direccion || '',
                        dia_visita: c.dia_visita,
                        nota: c.nota,
                        tipo_negocio: c.tipo_negocio,
                        orden: index + 1, // 🆕 El orden viene del servidor
                        esDeRuta: true
                    }));

                    // 🆕 El servidor ya devuelve solo los clientes del día, ordenados
                    setClientesDelDia(clientesDelDiaFormateados);
                    console.log(`📥 Clientes del ${dia} cargados y ordenados:`, clientesDelDiaFormateados.length);

                    // Cargar también todos para la vista "Todos"
                    const urlTodos = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}`;
                    const responseTodos = await fetch(urlTodos);
                    if (responseTodos.ok) {
                        const dataTodos = await responseTodos.json();
                        const todosFormateados = dataTodos.map(c => ({
                            id: c.id.toString(),
                            nombre: c.nombre_contacto || c.nombre_negocio,
                            negocio: c.nombre_negocio,
                            celular: c.telefono || '',
                            direccion: c.direccion || '',
                            dia_visita: c.dia_visita,
                            nota: c.nota,
                            tipo_negocio: c.tipo_negocio,
                            esDeRuta: true
                        }));

                        setTodosLosClientes(todosFormateados);

                        // Guardar en cache
                        const cacheKey = `${CACHE_KEY_CLIENTES}${userId}`;
                        await AsyncStorage.setItem(cacheKey, JSON.stringify({
                            clientes: todosFormateados,
                            timestamp: Date.now()
                        }));
                    }
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    console.error('⏱️ Timeout cargando clientes del servidor');
                } else {
                    throw fetchError;
                }
            }
        } catch (error) {
            console.error('❌ Error cargando clientes:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filtrar clientes según búsqueda
    const getClientesFiltrados = () => {
        const listaBase = mostrarTodos ? todosLosClientes : clientesDelDia;

        if (busqueda.trim() === '') {
            return listaBase;
        }

        const queryLower = busqueda.toLowerCase();
        return listaBase.filter(c =>
            c.nombre?.toLowerCase().includes(queryLower) ||
            c.negocio?.toLowerCase().includes(queryLower) ||
            c.direccion?.toLowerCase().includes(queryLower)
        );
    };

    const handleSelectCliente = (cliente) => {
        onSelectCliente(cliente);
        setBusqueda('');
        setMostrarTodos(false);
        onClose();
    };

    const handleNuevoCliente = () => {
        onNuevoCliente();
        setMostrarTodos(false);
        onClose();
    };

    // 🆕 Función para navegar
    const handleNavegar = (direccion) => {
        if (!direccion) {
            Alert.alert('Sin dirección', 'Este cliente no tiene una dirección registrada.');
            return;
        }
        const query = encodeURIComponent(direccion);
        // Intentar abrir Google Maps
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    };

    const renderCliente = ({ item, index }) => {
        // 🆕 Verificar si ya le vendieron hoy
        const norm = (t) => t ? t.toString().toLowerCase().trim() : '';
        let ventaRealizada = null;

        if (ventasDelDia && Array.isArray(ventasDelDia) && ventasDelDia.length > 0) {
            ventaRealizada = ventasDelDia.find(venta => {
                const vNegocio = norm(venta.cliente_negocio);
                const vNombre = norm(venta.cliente_nombre);
                const cNegocio = norm(item.negocio);
                const cNombre = norm(item.nombre);

                return (vNegocio && vNegocio === cNegocio) || (vNombre && vNombre === cNombre);
            });
        }

        const yaVendido = !!ventaRealizada;

        // 🆕 Verificar si tiene pedidos pendientes
        const pedidosCliente = pedidosPendientes.filter(p => {
            const pDestinatario = norm(p.destinatario);
            const cNegocio = norm(item.negocio);
            const cNombre = norm(item.nombre);
            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
        });

        const tienePedidos = pedidosCliente.length > 0;
        const pedido = tienePedidos ? pedidosCliente[0] : null; // Por ahora tomar el primero

        // 🆕 Verificar si tiene pedidos entregados
        const pedidoEntregado = pedidosEntregadosHoy.find(p => {
            const pDestinatario = norm(p.destinatario);
            const cNegocio = norm(item.negocio);
            const cNombre = norm(item.nombre);
            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
        });

        // 🆕 Verificar si tiene pedidos NO entregados
        const pedidoNoEntregado = pedidosNoEntregadosHoy.find(p => {
            const pDestinatario = norm(p.destinatario);
            const cNegocio = norm(item.negocio);
            const cNombre = norm(item.nombre);
            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
        });

        // 🆕 Variables para ordenamiento (solo si estamos en Hoy y sin búsqueda)
        const mostrarFlechas = !mostrarTodos && busqueda.trim() === '';

        // 🆕 Variables para Movimiento Rápido
        const isDragging = dragTarget && dragTarget.original === index;
        const currentDisplayIndex = isDragging ? dragTarget.destino : index;

        const esPrimero = currentDisplayIndex === 0;
        const esUltimo = currentDisplayIndex === clientesDelDia.length - 1;

        // Si tiene pedidos entregados, mostrar card verde
        if (pedidoEntregado) {
            return (
                <TouchableOpacity
                    style={[
                        styles.clienteItem,
                        styles.clienteItemEntregado, // 🆕 Fondo verde transparente
                    ]}
                    onPress={() => handleSelectCliente(item)}
                    activeOpacity={0.9}
                >
                    {/* 🆕 Columna de Flechas de Ordenamiento (Izquierda) */}
                    {mostrarFlechas && (
                        <View
                            style={styles.columnaFlechas}
                            onStartShouldSetResponder={() => true} // 🛑 Bloquea toques al padre
                        >
                            <TouchableOpacity
                                style={[styles.btnFlechaMini, esPrimero && styles.btnFlechaDeshabilitado]}
                                onPressIn={() => startRapidMove(index, -1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(index, -1)} // 🚀 Fin Hold
                                disabled={esPrimero}
                            >
                                <Ionicons name="chevron-up" size={24} color={esPrimero ? "#eee" : "#22c55e"} />
                            </TouchableOpacity>
                            <Text style={[
                                styles.indiceMini,
                                { color: '#22c55e' },
                                isDragging && {
                                    position: 'absolute',
                                    left: 200,
                                    backgroundColor: 'rgba(255,255,255,0.9)', // 🆕 Fondo sutil sin borde
                                    paddingHorizontal: 8, // Un poco de aire
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    fontSize: 20, // 🆕 Más pequeño (antes 24)
                                    fontWeight: 'bold',
                                    elevation: 50,
                                    zIndex: 9999,
                                    textAlign: 'center',
                                    minWidth: 30
                                }
                            ]}>
                                {currentDisplayIndex + 1}
                            </Text>
                            <TouchableOpacity
                                style={[styles.btnFlechaMini, esUltimo && styles.btnFlechaDeshabilitado]}
                                onPressIn={() => startRapidMove(index, 1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(index, 1)} // 🚀 Fin Hold
                                disabled={esUltimo}
                            >
                                <Ionicons name="chevron-down" size={24} color={esUltimo ? "#eee" : "#22c55e"} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Icono del cliente */}
                    <View style={styles.clienteIcono}>
                        <Ionicons name="cube" size={24} color="#22c55e" />
                    </View>

                    {/* Información del cliente */}
                    <View style={styles.clienteInfo}>
                        <Text style={styles.clienteNombre}>{item.negocio}</Text>
                        {item.nombre && item.nombre !== item.negocio && (
                            <Text style={styles.clienteContacto}>👤 {item.nombre}</Text>
                        )}
                        <Text style={styles.clienteDetalle}>
                            📦 Pedido #{pedidoEntregado.numero_pedido}
                        </Text>
                        {item.celular || (pedidoEntregado && pedidoEntregado.telefono_contacto) ? (
                            <Text style={styles.clienteDetalle}>📞 {item.celular || (pedidoEntregado && pedidoEntregado.telefono_contacto)}</Text>
                        ) : null}
                        {item.direccion && (
                            <Text style={styles.clienteDetalle}>📍 {item.direccion}</Text>
                        )}
                    </View>

                    {/* Flecha indicadora */}
                    <Ionicons name="chevron-forward" size={20} color="#22c55e" />

                    {/* 🆕 Badge "Entregado" en esquina superior derecha */}
                    <View style={styles.badgeEntregadoCliente}>
                        <Text style={styles.badgeEntregadoTexto}>Entregado</Text>
                    </View>

                    {/* 🆕 Acciones Verticales */}
                    <View style={{ flexDirection: 'column', alignItems: 'center', marginRight: 5, gap: 5 }}>
                        {item.nota ? (
                            <TouchableOpacity
                                onPress={() => Alert.alert('Nota', item.nota)}
                            >
                                <Ionicons name="document-text" size={26} color="#dc3545" />
                            </TouchableOpacity>
                        ) : null}

                        {item.direccion ? (
                            <TouchableOpacity
                                style={styles.btnNavegar}
                                onPress={() => {
                                    handleSelectCliente(item);
                                    handleNavegar(item.direccion);
                                }}
                            >
                                <Ionicons name="navigate-circle" size={32} color="#22c55e" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </TouchableOpacity>
            );
        }

        // 🆕 Si tiene pedido NO entregado, mostrar card roja
        if (pedidoNoEntregado) {
            return (
                <TouchableOpacity
                    style={[
                        styles.clienteItem,
                        styles.clienteItemNoEntregado, // 🆕 Fondo rojo transparente
                    ]}
                    onPress={() => handleSelectCliente(item)}
                    activeOpacity={0.9}
                >
                    {/* 🆕 Columna de Flechas de Ordenamiento (Izquierda) */}
                    {mostrarFlechas && (
                        <View
                            style={styles.columnaFlechas}
                            onStartShouldSetResponder={() => true}
                        >
                            <TouchableOpacity
                                style={[styles.btnFlechaMini, esPrimero && styles.btnFlechaDeshabilitado]}
                                onPressIn={() => startRapidMove(index, -1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(index, -1)} // 🚀 Fin Hold
                                disabled={esPrimero}
                            >
                                <Ionicons name="chevron-up" size={24} color={esPrimero ? "#eee" : "#dc3545"} />
                            </TouchableOpacity>
                            <Text style={[
                                styles.indiceMini,
                                { color: '#dc3545' },
                                isDragging && {
                                    position: 'absolute',
                                    left: 200,
                                    backgroundColor: 'rgba(255,255,255,0.9)',
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    fontSize: 20,
                                    fontWeight: 'bold',
                                    elevation: 50,
                                    zIndex: 9999,
                                    textAlign: 'center',
                                    minWidth: 30
                                }
                            ]}>
                                {currentDisplayIndex + 1}
                            </Text>
                            <TouchableOpacity
                                style={[styles.btnFlechaMini, esUltimo && styles.btnFlechaDeshabilitado]}
                                onPressIn={() => startRapidMove(index, 1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(index, 1)} // 🚀 Fin Hold
                                disabled={esUltimo}
                            >
                                <Ionicons name="chevron-down" size={24} color={esUltimo ? "#eee" : "#dc3545"} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Icono del cliente */}
                    <View style={styles.clienteIcono}>
                        <Ionicons name="alert-circle" size={24} color="#dc3545" />
                    </View>

                    {/* Información del cliente */}
                    <View style={styles.clienteInfo}>
                        <Text style={styles.clienteNombre}>{item.negocio}</Text>
                        {item.nombre && item.nombre !== item.negocio && (
                            <Text style={styles.clienteContacto}>👤 {item.nombre}</Text>
                        )}
                        <Text style={styles.clienteDetalle}>
                            📦 Pedido #{pedidoNoEntregado.numero_pedido}
                        </Text>
                        {item.celular || (pedidoNoEntregado && pedidoNoEntregado.telefono_contacto) ? (
                            <Text style={styles.clienteDetalle}>📞 {item.celular || (pedidoNoEntregado && pedidoNoEntregado.telefono_contacto)}</Text>
                        ) : null}
                        {item.direccion && (
                            <Text style={styles.clienteDetalle}>📍 {item.direccion}</Text>
                        )}
                    </View>

                    {/* Flecha indicadora */}
                    <Ionicons name="chevron-forward" size={20} color="#dc3545" />

                    {/* 🆕 Badge "No Entregado" en esquina superior derecha */}
                    <View style={styles.badgeNoEntregadoCliente}>
                        <Text style={styles.badgeNoEntregadoTexto}>No Entregado</Text>
                    </View>

                    {/* 🆕 Acciones Verticales */}
                    <View style={{ flexDirection: 'column', alignItems: 'center', marginRight: 5, gap: 5 }}>
                        {item.nota ? (
                            <TouchableOpacity
                                onPress={() => Alert.alert('Nota', item.nota)}
                            >
                                <Ionicons name="document-text" size={26} color="#dc3545" />
                            </TouchableOpacity>
                        ) : null}

                        {item.direccion ? (
                            <TouchableOpacity
                                style={styles.btnNavegar}
                                onPress={() => {
                                    handleSelectCliente(item);
                                    handleNavegar(item.direccion);
                                }}
                            >
                                <Ionicons name="navigate-circle" size={32} color="#22c55e" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </TouchableOpacity>
            );
        }

        // Si tiene pedidos, mostrar card especial
        if (tienePedidos && pedido) {
            return (
                <TouchableOpacity
                    style={[
                        styles.clienteItem,
                        styles.clienteItemConPedido, // Fondo rojo transparente
                    ]}
                    onPress={() => handleSelectCliente(item)}
                    activeOpacity={0.9}
                >
                    {/* 🆕 Columna de Flechas de Ordenamiento (Izquierda) */}
                    {mostrarFlechas && (
                        <View
                            style={styles.columnaFlechas}
                            onStartShouldSetResponder={() => true}
                        >
                            <TouchableOpacity
                                style={[styles.btnFlechaMini, esPrimero && styles.btnFlechaDeshabilitado]}
                                onPressIn={() => startRapidMove(index, -1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(index, -1)} // 🚀 Fin Hold
                                disabled={esPrimero}
                            >
                                <Ionicons name="chevron-up" size={24} color={esPrimero ? "#eee" : "#ff9800"} />
                            </TouchableOpacity>
                            <Text style={[
                                styles.indiceMini,
                                { color: '#ff9800' },
                                isDragging && {
                                    position: 'absolute',
                                    left: 200,
                                    backgroundColor: 'rgba(255,255,255,0.9)',
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    fontSize: 20,
                                    fontWeight: 'bold',
                                    elevation: 50,
                                    zIndex: 9999,
                                    textAlign: 'center',
                                    minWidth: 30
                                }
                            ]}>
                                {currentDisplayIndex + 1}
                            </Text>
                            <TouchableOpacity
                                style={[styles.btnFlechaMini, esUltimo && styles.btnFlechaDeshabilitado]}
                                onPressIn={() => startRapidMove(index, 1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(index, 1)} // 🚀 Fin Hold
                                disabled={esUltimo}
                            >
                                <Ionicons name="chevron-down" size={24} color={esUltimo ? "#eee" : "#ff9800"} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Icono del cliente */}
                    <View style={styles.clienteIcono}>
                        <Ionicons name="cube" size={24} color="#ff9800" />
                    </View>

                    {/* Información del cliente */}
                    <View style={styles.clienteInfo}>
                        <Text style={styles.clienteNombre}>{item.negocio}</Text>
                        {item.nombre && item.nombre !== item.negocio && (
                            <Text style={styles.clienteContacto}>👤 {item.nombre}</Text>
                        )}
                        <Text style={styles.clienteDetalle}>
                            📦 Pedido #{pedido.numero_pedido}
                        </Text>
                        {item.celular || pedido.telefono_contacto ? (
                            <Text style={styles.clienteDetalle}>📞 {item.celular || pedido.telefono_contacto}</Text>
                        ) : null}
                        {item.direccion && (
                            <Text style={styles.clienteDetalle}>📍 {item.direccion}</Text>
                        )}
                    </View>

                    {/* Flecha indicadora */}
                    <Ionicons name="chevron-forward" size={20} color="#ff9800" />

                    {/* 🆕 Badge "Pendiente" en esquina superior derecha */}
                    <View style={styles.badgePendienteCliente}>
                        <Text style={styles.badgePendienteTexto}>Pendiente</Text>
                    </View>

                    {/* 🆕 Acciones Verticales */}
                    <View style={{ flexDirection: 'column', alignItems: 'center', marginRight: 5, gap: 5 }}>
                        {item.nota ? (
                            <TouchableOpacity
                                onPress={() => Alert.alert('Nota', item.nota)}
                            >
                                <Ionicons name="document-text" size={26} color="#dc3545" />
                            </TouchableOpacity>
                        ) : null}

                        {item.direccion ? (
                            <TouchableOpacity
                                style={styles.btnNavegar}
                                onPress={() => {
                                    handleSelectCliente(item);
                                    handleNavegar(item.direccion);
                                }}
                            >
                                <Ionicons name="navigate-circle" size={32} color="#22c55e" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </TouchableOpacity>
            );
        }

        // Cliente normal (sin pedidos)

        // 🆕 Lógica para determinar si es Ruta (R) o Pedido (P)
        // Usamos el campo tipo_negocio que trae el ORIGEN (ej: "NEGOCIO | PEDIDOS")
        const esPedido = item.tipo_negocio && item.tipo_negocio.toUpperCase().includes('PEDIDOS');
        const esClienteRuta = !esPedido; // Si no es pedido, es ruta
        const letraTipo = esPedido ? 'P' : 'R';
        const estiloBadge = esPedido ? styles.badgeTipoPedido : styles.badgeTipoRuta;

        return (
            <TouchableOpacity
                style={[
                    styles.clienteItem
                ]}
                onPress={() => handleSelectCliente(item)}
            >
                {/* 🆕 Columna de Flechas de Ordenamiento (Izquierda) */}
                {mostrarFlechas && (
                    <View
                        style={styles.columnaFlechas}
                        onStartShouldSetResponder={() => true}
                    >
                        <TouchableOpacity
                            style={[styles.btnFlechaMini, esPrimero && styles.btnFlechaDeshabilitado]}
                            onPressIn={() => startRapidMove(index, -1)} // 🚀 Inicio Hold
                            onPressOut={() => stopRapidMove(index, -1)} // 🚀 Fin Hold
                            disabled={esPrimero}
                        >
                            <Ionicons name="chevron-up" size={24} color={esPrimero ? "#eee" : "#003d88"} />
                        </TouchableOpacity>

                        {/* Número índice pequeño (opcional, ayuda visual) */}
                        <Text style={[
                            styles.indiceMini,
                            { color: '#ccc' },
                            isDragging && {
                                position: 'absolute',
                                left: 200,
                                backgroundColor: 'rgba(255,255,255,0.9)',
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 8,
                                fontSize: 20,
                                elevation: 50,
                                zIndex: 9999,
                                textAlign: 'center',
                                minWidth: 30,
                                color: '#003d88'
                            }
                        ]}>
                            {currentDisplayIndex + 1}
                        </Text>

                        <TouchableOpacity
                            style={[styles.btnFlechaMini, esUltimo && styles.btnFlechaDeshabilitado]}
                            onPressIn={() => startRapidMove(index, 1)} // 🚀 Inicio Hold
                            onPressOut={() => stopRapidMove(index, 1)} // 🚀 Fin Hold
                            disabled={esUltimo}
                        >
                            <Ionicons name="chevron-down" size={24} color={esUltimo ? "#eee" : "#003d88"} />
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.clienteIcono}>
                    {yaVendido ? (
                        <Ionicons name="checkmark-circle" size={24} color="#00ad53" />
                    ) : (
                        <Ionicons name="storefront" size={24} color="#003d88" />
                    )}

                    {/* 🆕 Badge Tipo Cliente (R o P) */}
                    <View style={[
                        styles.badgeTipoCliente,
                        estiloBadge
                    ]}>
                        <Text style={styles.badgeTipoTexto}>{letraTipo}</Text>
                    </View>
                </View>

                <View style={styles.clienteInfo}>
                    <Text style={styles.clienteNombre}>{item.negocio}</Text>
                    {item.nombre && item.nombre !== item.negocio && (
                        <Text style={styles.clienteContacto}>👤 {item.nombre}</Text>
                    )}
                    {item.celular && (
                        <Text style={styles.clienteDetalle}>📞 {item.celular}</Text>
                    )}
                    {item.direccion && (
                        <Text style={styles.clienteDetalle}>📍 {item.direccion}</Text>
                    )}
                    {ventaRealizada && (
                        <Text style={styles.clienteDetalleVenta}>
                            💰 Venta: ${parseFloat(ventaRealizada.total).toLocaleString('es-CO')}
                        </Text>
                    )}
                    {/* Mostrar día de visita si es R */}
                    {esClienteRuta && (
                        <Text style={styles.clienteDia}>📅 {item.dia_visita}</Text>
                    )}
                </View>


                {/* 🆕 Acciones Verticales */}
                <View style={{ flexDirection: 'column', alignItems: 'center', marginRight: 5, gap: 5 }}>
                    {item.nota ? (
                        <TouchableOpacity
                            onPress={() => Alert.alert('Nota', item.nota)}
                        >
                            <Ionicons name="document-text" size={26} color="#dc3545" />
                        </TouchableOpacity>
                    ) : null}

                    {item.direccion ? (
                        <TouchableOpacity
                            style={styles.btnNavegar}
                            onPress={() => {
                                handleSelectCliente(item);
                                handleNavegar(item.direccion);
                            }}
                        >
                            <Ionicons name="navigate-circle" size={32} color="#22c55e" />
                        </TouchableOpacity>
                    ) : null}
                </View>

                <Ionicons name="chevron-forward" size={20} color={yaVendido ? "#00ad53" : "#666"} />
                {
                    yaVendido && (
                        <View style={styles.badgeVendidoCliente}>
                            <Text style={styles.badgeVendidoTexto}>Vendido</Text>
                        </View>
                    )
                }
            </TouchableOpacity >
        );
    };

    const clientesFiltrados = getClientesFiltrados();

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.btnCerrar}>
                        <Ionicons name="close" size={28} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.titulo}>Seleccionar Cliente</Text>
                    <View style={{ width: 28 }} />
                </View>

                {/* Tabs: Hoy / Todos */}
                <View style={styles.tabsContainer}>
                    <TouchableOpacity
                        style={[styles.tab, !mostrarTodos && styles.tabActivo]}
                        onPress={() => setMostrarTodos(false)}
                    >
                        <Ionicons name="today" size={18} color={!mostrarTodos ? 'white' : '#003d88'} />
                        <Text style={[styles.tabTexto, !mostrarTodos && styles.tabTextoActivo]}>
                            Hoy ({diaActual})
                        </Text>
                        <View style={[styles.badge, !mostrarTodos && styles.badgeActivo]}>
                            <Text style={[styles.badgeTexto, !mostrarTodos && styles.badgeTextoActivo]}>
                                {clientesDelDia.length}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.tab, mostrarTodos && styles.tabActivo]}
                        onPress={() => setMostrarTodos(true)}
                    >
                        <Ionicons name="people" size={18} color={mostrarTodos ? 'white' : '#003d88'} />
                        <Text style={[styles.tabTexto, mostrarTodos && styles.tabTextoActivo]}>
                            Todos
                        </Text>
                        <View style={[styles.badge, mostrarTodos && styles.badgeActivo]}>
                            <Text style={[styles.badgeTexto, mostrarTodos && styles.badgeTextoActivo]}>
                                {todosLosClientes.length}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Búsqueda */}
                <View style={styles.busquedaContainer}>
                    <Ionicons name="search" size={20} color="#666" style={styles.iconoBusqueda} />
                    <TextInput
                        style={styles.inputBusqueda}
                        placeholder="Buscar por nombre, negocio o dirección..."
                        value={busqueda}
                        onChangeText={setBusqueda}
                        autoCapitalize="none"
                    />
                    {busqueda.length > 0 && (
                        <TouchableOpacity onPress={() => setBusqueda('')}>
                            <Ionicons name="close-circle" size={20} color="#666" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Botón Nuevo Cliente */}
                <View style={styles.botonesAccion}>
                    <TouchableOpacity
                        style={styles.btnNuevoCliente}
                        onPress={handleNuevoCliente}
                    >
                        <Ionicons name="add-circle" size={24} color="white" />
                        <Text style={styles.btnNuevoClienteTexto}>Nuevo Cliente</Text>
                    </TouchableOpacity>
                </View>

                {/* 🆕 Indicador de guardando */}
                {guardandoOrden && (
                    <View style={styles.guardandoContainer}>
                        <ActivityIndicator size="small" color="#ff9800" />
                        <Text style={styles.guardandoTexto}>Guardando orden...</Text>
                    </View>
                )}

                {/* Loading */}
                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#003d88" />
                        <Text style={styles.loadingText}>Cargando clientes...</Text>
                    </View>
                )}

                {/* Lista de Clientes - Modo Ordenar con Flechas */}
                {!loading && (
                    <FlatList
                        data={clientesFiltrados}
                        renderItem={renderCliente}
                        keyExtractor={(item) => item.id}
                        style={styles.lista}
                        contentContainerStyle={styles.listaContent}
                        extraData={clientesDelDia} // Para actualizar ordenamiento
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="people-outline" size={48} color="#ccc" />
                                <Text style={styles.emptyTexto}>
                                    {mostrarTodos
                                        ? 'No hay clientes en tu ruta'
                                        : `No hay clientes para ${diaActual}`}
                                </Text>
                                {!mostrarTodos && (
                                    <TouchableOpacity
                                        style={styles.btnVerTodos}
                                        onPress={() => setMostrarTodos(true)}
                                    >
                                        <Text style={styles.btnVerTodosTexto}>Ver todos los clientes</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        }
                    />
                )}
            </View>
        </Modal >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingTop: 15, // 🆕 Reducido de 50 a 15 para ganar espacio
        paddingHorizontal: 15,
        paddingBottom: 10, // 🆕 Reducido
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    btnCerrar: {
        padding: 5,
    },
    titulo: {
        fontSize: 18, // Un poco más compacto
        fontWeight: 'bold',
        color: '#333',
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 8, // 🆕 Reducido de 10
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8, // 🆕 Reducido de 12 para hacer tabs más delgadas
        borderRadius: 8,
        backgroundColor: '#f0f8ff',
        borderWidth: 1,
        borderColor: '#003d88',
        gap: 6,
    },
    tabActivo: {
        backgroundColor: '#003d88',
    },
    tabTexto: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#003d88',
    },
    tabTextoActivo: {
        color: 'white',
    },
    badge: {
        backgroundColor: '#003d88',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    badgeActivo: {
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    badgeTexto: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    badgeTextoActivo: {
        color: 'white',
    },
    busquedaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    iconoBusqueda: {
        marginRight: 8,
    },
    inputBusqueda: {
        flex: 1,
        fontSize: 16,
        padding: 8,
    },
    btnNuevoCliente: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00ad53',
        padding: 12,
        borderRadius: 8,
        gap: 8,
    },
    btnNuevoClienteTexto: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: '#666',
    },
    lista: {
        flex: 1,
    },
    listaContent: {
        padding: 15,
    },
    clienteItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 10, // 🆕 Reducido de 15 para compactar
        marginBottom: 8, // 🆕 Espacio más ajustado entre tarjetas
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        elevation: 1,
        minHeight: 80, // 🆕 Altura mínima reducida
    },
    clienteIcono: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#f0f8ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    clienteInfo: {
        flex: 1,
    },
    clienteNombre: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 2,
    },
    clienteContacto: {
        fontSize: 14,
        color: '#666',
        marginBottom: 2,
    },
    clienteDetalle: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
    },
    clienteDia: {
        fontSize: 11,
        color: '#003d88',
        marginTop: 4,
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTexto: {
        fontSize: 16,
        color: '#999',
        marginTop: 10,
        textAlign: 'center',
    },
    btnVerTodos: {
        marginTop: 15,
        padding: 12,
        backgroundColor: '#003d88',
        borderRadius: 8,
    },
    btnVerTodosTexto: {
        color: 'white',
        fontWeight: 'bold',
    },
    // 🆕 Estilos Ya Vendido
    clienteItemVendido: {
        borderWidth: 2,
    },
    // 🆕 Estilos Clientes con Pedido
    clienteItemConPedido: {
        backgroundColor: 'rgba(255, 152, 0, 0.08)', // 🟠 Fondo naranja transparente
        borderColor: '#ff9800', // 🟠 Borde naranja
        borderWidth: 1,
        elevation: 0, // Sin sombra
    },
    clienteItemEntregado: {
        backgroundColor: 'rgba(34, 197, 94, 0.1)', // Fondo verde transparente
        borderColor: '#22c55e', // Borde verde
        borderWidth: 1,
        elevation: 0, // Sin sombra
    },
    badgeEntregadoCliente: {
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
    badgeVendidoCliente: {
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

    botonesAccionPedido: {
        flexDirection: 'column',
        gap: 8,
        marginLeft: 8,
    },
    btnAccionPedido: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white',
        borderWidth: 2,
    },
    btnNoEntregado: {
        borderColor: '#dc3545',
    },
    btnEntregar: {
        borderColor: '#28a745',
    },
    btnEditar: {
        borderColor: '#007bff',
    },
    clienteDetalleVenta: {
        fontSize: 12,
        color: '#00ad53',
        fontWeight: 'bold',
        marginTop: 2,
    },
    // 🆕 Estilos No Entregado
    clienteItemNoEntregado: {
        backgroundColor: 'rgba(220, 53, 69, 0.1)', // Fondo rojo transparente
        borderColor: '#dc3545', // Borde rojo
        borderWidth: 1,
        elevation: 0,
    },
    badgeNoEntregadoCliente: {
        position: 'absolute',
        top: 4,
        right: 4,
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
    // 🟠 Estilos Badge Pendiente
    badgePendienteCliente: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#ff9800',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgePendienteTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    btnAccionPedidoTexto: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    // 🆕 Estilos Badges R / P
    badgeTipoCliente: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'white',
    },
    badgeTipoRuta: {
        backgroundColor: '#003d88', // Azul Ruta
    },
    badgeTipoPedido: {
        backgroundColor: '#6f42c1', // Morado Pedido
    },
    badgeTipoTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    btnNavegar: {
        padding: 5,
        marginRight: 5,
    },
    // 🆕 Estilos para Drag & Drop
    botonesAccion: {
        flexDirection: 'row',
        paddingHorizontal: 15,
        paddingVertical: 8,
        gap: 10,
    },
    btnOrdenar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: '#ff9800',
        gap: 8,
    },
    btnOrdenarActivo: {
        backgroundColor: '#ff9800',
        borderColor: '#ff9800',
    },
    btnOrdenarTexto: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ff9800',
    },
    btnOrdenarTextoActivo: {
        color: 'white',
    },
    guardandoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
        paddingHorizontal: 15,
        gap: 8,
        backgroundColor: '#fff3e0',
    },
    guardandoTexto: {
        fontSize: 12,
        color: '#ff9800',
        fontWeight: '500',
    },
    instruccionOrdenar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 15,
        backgroundColor: '#fff3e0',
        gap: 8,
    },
    instruccionTexto: {
        fontSize: 13,
        color: '#e65100',
        fontWeight: '500',
    },
    clienteItemDraggable: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 12,
        marginHorizontal: 10,
        marginVertical: 4,
        borderRadius: 10,
        borderLeftWidth: 4,
        borderLeftColor: '#ff9800',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    clienteItemDragging: {
        backgroundColor: '#fff3e0',
        borderLeftColor: '#e65100',
        elevation: 4,
    },
    ordenControles: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        paddingHorizontal: 0,
        gap: -4, // Reducir espacio entre flechas y número
    },
    btnFlecha: {
        padding: 2, // Menos padding para botones más compactos
    },
    btnFlechaDeshabilitado: {
        opacity: 0.3,
    },
    dragIndex: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#003d88', // Azul corporativo
        marginVertical: 0,
    },
    clienteInfoDrag: {
        flex: 1,
        justifyContent: 'center',
    },
    clienteNombreDrag: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#333',
    },
    clienteContactoDrag: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    clienteDireccionDrag: {
        fontSize: 11,
        color: '#888',
        marginTop: 2,
    },
    // 🆕 Estilos para ordenamiento integrado
    columnaFlechas: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'stretch',
        marginRight: 2, // 🆕 Reducido para dar más espacio al texto
        marginLeft: -4,
        paddingRight: 0, // 🆕 Reducido
        paddingVertical: 2,
        borderRightWidth: 0,
        minWidth: 28, // 🆕 Más compacto
        gap: 12,
        zIndex: 10, // 🆕 Para que el popup salga por encima del icono
    },
    btnFlechaMini: {
        padding: 0,
        height: 28, // Altura justa para el toque
        justifyContent: 'center',
        alignItems: 'center',
    },
    indiceMini: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#ccc',
        marginVertical: 0, // El espacio lo da el space-between
    },
    btnFlechaDeshabilitado: {
        opacity: 0, // Totalmente invisible si no se puede usar
    },
});

export default ClienteSelector;
