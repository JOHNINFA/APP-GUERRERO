import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
const CACHE_KEY_CLIENTES_TODOS = 'clientes_cache_todos_';
const CACHE_KEY_CLIENTES_DIA = 'clientes_cache_dia_';
const CACHE_KEY_CLIENTES_LEGACY = 'clientes_cache_'; // Compatibilidad con caché anterior
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 horas

const ClienteSelector = ({
    visible,
    onClose,
    onSelectCliente,
    onNuevoCliente,
    userId,
    diaSeleccionado,
    ventasDelDia = [],
    fechaSeleccionada = null, // 🆕 Fecha del turno para consultar backend
    pedidosPendientes = [], // 🆕 Lista de pedidos pendientes
    pedidosEntregadosHoy = [], // 🆕 Lista de pedidos entregados hoy
    pedidosNoEntregadosHoy = [], // 🆕 Lista de pedidos no entregados hoy
    onCargarPedido, // 🆕 Función para cargar pedido en carrito
    onMarcarEntregado, // 🆕 Función para marcar pedido como entregado
    onMarcarNoEntregado, // 🆕 Función para marcar pedido como no entregado
    onClientesDiaActualizados, // 🆕 Reportar orden del día al padre para auto-siguiente cliente
    onActualizarPedidos // 🆕 Refrescar pedidos pendientes desde el padre
}) => {
    const [clientesDelDia, setClientesDelDia] = useState([]);
    const [todosLosClientes, setTodosLosClientes] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(false);
    const [mostrarTodos, setMostrarTodos] = useState(false);
    const [diaActual, setDiaActual] = useState('');
    const [actualizandoEnFondo, setActualizandoEnFondo] = useState(false);
    // 🆕 Flag para evitar actualización automática después de mover clientes
    const [ultimoMovimiento, setUltimoMovimiento] = useState(null);
    const [actualizandoManual, setActualizandoManual] = useState(false); // 🆕 Solo mostrar spinner si es manual
    // 🆕 Ventas obtenidas del backend (para badge "Vendido" que sobrevive borrar caché)
    const [ventasBackend, setVentasBackend] = useState([]);

    // 🆕 Estados para Drag & Drop
    const [modoOrdenar, setModoOrdenar] = useState(false);
    const [guardandoOrden, setGuardandoOrden] = useState(false);

    const normalizarTexto = (texto) => (texto ? texto.toString().toLowerCase().trim() : '');
    const ITEM_HEIGHT_ESTIMADO = 96;
    const [rutaId, setRutaId] = useState(null);

    // 🆕 Ref para acceder al estado actual en funciones asíncronas
    const modoOrdenarRef = React.useRef(modoOrdenar);

    useEffect(() => {
        modoOrdenarRef.current = modoOrdenar;
    }, [modoOrdenar]);

    const formatearCliente = (c, index, incluirOrden = false) => ({
        id: c.id.toString(),
        nombre: c.nombre_contacto || c.nombre_negocio,
        negocio: c.nombre_negocio,
        celular: c.telefono || '',
        direccion: c.direccion || '',
        dia_visita: c.dia_visita,
        nota: c.nota,
        tipo_negocio: c.tipo_negocio,
        lista_precio_nombre: c.lista_precio_nombre || c.tipo_lista_precio,
        ...(incluirOrden ? { orden: index + 1 } : {}),
        esDeRuta: true
    });

    const construirCacheKeys = (dia) => ({
        cacheKeyTodos: `${CACHE_KEY_CLIENTES_TODOS}${userId}`,
        cacheKeyDia: `${CACHE_KEY_CLIENTES_DIA}${userId}_${dia}`
    });

    // 🆕 Obtener rutaId del vendedor (ya no es necesario para guardar orden)
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
            console.log('⚠️ No se pudo obtener rutaId (no crítico):', error.message);
        }
        return null;
    };

    // 🆕 Guardar orden de clientes después de drag & drop
    const guardarOrdenClientes = async (nuevoOrden) => {
        if (!diaActual) {
            console.log('⚠️ No se puede guardar: falta día');
            return;
        }

        // 🔥 Marcar que acabamos de mover un cliente (evitar actualización automática)
        setUltimoMovimiento(Date.now());

        // 🚀 NO mostrar spinner - guardado optimista en segundo plano
        try {
            const clientesIds = nuevoOrden.map(c => parseInt(c.id));
            console.log('💾 Guardando orden en segundo plano para día:', diaActual);

            // ⚡ Anti-rebote: actualizar caché local del día inmediatamente
            try {
                const { cacheKeyDia } = construirCacheKeys(diaActual);
                const ordenConPosicion = nuevoOrden.map((c, idx) => ({
                    ...c,
                    orden: idx + 1
                }));
                await AsyncStorage.setItem(cacheKeyDia, JSON.stringify({
                    clientes: ordenConPosicion,
                    timestamp: Date.now()
                }));
                console.log('✅ Caché local de orden actualizada (anti-rebote)');
            } catch (cacheError) {
                console.log('⚠️ No se pudo actualizar caché local de orden:', cacheError.message);
            }

            // Guardar en segundo plano sin bloquear UI
            fetch(`${API_URL}/api/ruta-orden/guardar_orden_vendedor/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendedor_id: userId,
                    dia: diaActual,
                    clientes_ids: clientesIds
                })
            }).then(response => {
                if (response.ok) {
                    console.log('✅ Orden guardado exitosamente');
                } else {
                    console.error('❌ Error al guardar orden:', response.status);
                }
            }).catch(error => {
                console.error('❌ Error guardando orden:', error);
            });
        } catch (error) {
            console.error('❌ Error preparando guardado:', error);
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

    // 🆕 Consultar ventas del backend en segundo plano (para badge "Vendido" tras borrar caché)
    const cargarVentasBackend = useCallback(async () => {
        try {
            if (!userId || !fechaSeleccionada) return;
            const fechaStr = fechaSeleccionada instanceof Date
                ? fechaSeleccionada.toISOString().split('T')[0]
                : String(fechaSeleccionada).split('T')[0];
            const vendedorIdVentas = String(userId).toUpperCase().startsWith('ID')
                ? String(userId).toUpperCase()
                : `ID${userId}`;
            const resp = await fetch(`${API_URL}/api/ventas-ruta/?vendedor_id=${vendedorIdVentas}&fecha=${fechaStr}`);
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data)) {
                    setVentasBackend(data); // Siempre actualizar (incluye ANULADAS)
                    const anuladas = data.filter(v => v.estado === 'ANULADA').length;
                    console.log(`✅ Ventas backend cargadas: ${data.length} total, ${anuladas} anuladas`);
                }
            }
        } catch (e) {
            // Silencioso: offline o error, badges usarán sólo datos locales
            console.log('ℹ️ Ventas backend no disponibles, badges sólo locales');
        }
    }, [userId, fechaSeleccionada]);


    useEffect(() => {
        if (visible) {
            // Usar el día seleccionado o el día actual
            const dia = diaSeleccionado || DIAS_SEMANA[new Date().getDay()];
            setDiaActual(dia);
            cargarClientesConCache(dia);
            obtenerRutaId();
            setModoOrdenar(false); // Resetear modo ordenar al abrir
            cargarVentasBackend();  // 🆕 Cargar ventas reales para badges
        }
    }, [visible, diaSeleccionado]);

    // 🆕 Cargar clientes primero del cache, luego actualizar desde servidor
    const cargarClientesConCache = async (dia) => {
        try {
            // 1. Intentar cargar del cache primero (INSTANTÁNEO, SIN SPINNER)
            const { cacheKeyTodos, cacheKeyDia } = construirCacheKeys(dia);
            const legacyKey = `${CACHE_KEY_CLIENTES_LEGACY}${userId}`;

            const [cachedTodosRaw, cachedDiaRaw, cachedLegacyRaw] = await Promise.all([
                AsyncStorage.getItem(cacheKeyTodos),
                AsyncStorage.getItem(cacheKeyDia),
                AsyncStorage.getItem(legacyKey)
            ]);

            let todosCache = null;
            let diaCache = null;

            if (cachedTodosRaw) {
                const parsed = JSON.parse(cachedTodosRaw);
                if (parsed?.clientes?.length && (Date.now() - parsed.timestamp) < CACHE_EXPIRY) {
                    todosCache = parsed.clientes;
                }
            }

            if (cachedDiaRaw) {
                const parsed = JSON.parse(cachedDiaRaw);
                if (parsed?.clientes?.length && (Date.now() - parsed.timestamp) < CACHE_EXPIRY) {
                    diaCache = parsed.clientes;
                }
            }

            // Compatibilidad: si existe cache legacy y no existe cache nuevo, usarlo
            if (!todosCache && cachedLegacyRaw) {
                const parsedLegacy = JSON.parse(cachedLegacyRaw);
                if (parsedLegacy?.clientes?.length) {
                    todosCache = parsedLegacy.clientes;
                }
            }

            if (todosCache || diaCache) {
                const clientesTodos = todosCache || [];
                const clientesDia = diaCache || clientesTodos.filter(c =>
                    c.dia_visita?.toUpperCase().includes(dia)
                );

                console.log('⚡ Carga INSTANTÁNEA del cache:', {
                    dia: clientesDia.length,
                    todos: clientesTodos.length
                });

                setClientesDelDia(clientesDia);
                setTodosLosClientes(clientesTodos);

                // 🔥 SIEMPRE actualizar desde servidor para obtener datos nuevos sin bloquear UI
                actualizarClientesEnFondo(dia);
                return;
            }

            // 2. Solo si NO hay cache, mostrar loading y cargar del servidor
            console.log('🔄 No hay caché, cargando desde servidor...');
            setLoading(true);
            await cargarClientesDelServidor(dia);

        } catch (error) {
            console.error('Error con cache:', error);
            setLoading(true);
            await cargarClientesDelServidor(dia);
        }
    };

    // 🆕 Actualizar clientes en segundo plano sin bloquear UI
    const actualizarClientesEnFondo = async (dia, manual = false) => {
        // 🔥 NO actualizar si el usuario acaba de mover un cliente (últimos 3 segundos)
        if (!manual && ultimoMovimiento && (Date.now() - ultimoMovimiento) < 3000) {
            console.log('⛔ Omitiendo actualización automática (usuario movió cliente recientemente)');
            return;
        }

        if (manual) {
            setActualizandoManual(true);
        } else {
            setActualizandoEnFondo(true);
        }

        try {
            // 🆕 Incluir día en la petición para que el servidor ordene correctamente
            const urlDia = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}&dia=${dia}`;
            const urlTodosSinFiltro = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}`;
            const [responseDia, responseTodos] = await Promise.allSettled([
                fetch(urlDia),
                fetch(urlTodosSinFiltro)
            ]);

            if (responseDia.status === 'fulfilled' && responseDia.value.ok) {
                const dataDia = await responseDia.value.json();
                let clientesTodosFormateados = null;

                if (responseTodos.status === 'fulfilled' && responseTodos.value.ok) {
                    const dataTodos = await responseTodos.value.json();
                    clientesTodosFormateados = dataTodos.map((c, index) => formatearCliente(c, index, false));
                }

                // 🛑 Si el usuario activó el modo ordenar mientras cargábamos, NO sobrescribir
                if (modoOrdenarRef.current) {
                    console.log('⛔ Omitiendo actualización de fondo (Modo ordenar activo)');
                    return;
                }

                const clientesDiaFormateados = dataDia.map((c, index) => formatearCliente(c, index, true));
                const { cacheKeyTodos, cacheKeyDia } = construirCacheKeys(dia);

                await AsyncStorage.setItem(cacheKeyDia, JSON.stringify({
                    clientes: clientesDiaFormateados,
                    timestamp: Date.now()
                }));

                if (clientesTodosFormateados) {
                    await AsyncStorage.setItem(cacheKeyTodos, JSON.stringify({
                        clientes: clientesTodosFormateados,
                        timestamp: Date.now()
                    }));
                }

                // 🆕 Los clientes ya vienen filtrados y ordenados por día del servidor
                setClientesDelDia(clientesDiaFormateados);
                if (clientesTodosFormateados) {
                    setTodosLosClientes(clientesTodosFormateados);
                }

                console.log('✅ Clientes actualizados en segundo plano. Orden del día:', dia);
            }
        } catch (error) {
            console.log('⚠️ Error actualizando en fondo:', error.message);
        } finally {
            if (manual) {
                setActualizandoManual(false);
            } else {
                setActualizandoEnFondo(false);
            }
        }
    };

    // 🆕 Cargar clientes del servidor (con timeout largo)
    const cargarClientesDelServidor = async (dia) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos

            try {
                // 🆕 Cargar día + todos en paralelo
                const urlDia = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}&dia=${dia}`;
                const urlTodos = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}`;
                const [responseDia, responseTodos] = await Promise.allSettled([
                    fetch(urlDia, { signal: controller.signal }),
                    fetch(urlTodos, { signal: controller.signal })
                ]);
                clearTimeout(timeoutId);

                if (responseDia.status === 'fulfilled' && responseDia.value.ok) {
                    const dataDia = await responseDia.value.json();
                    let todosFormateados = null;
                    if (responseTodos.status === 'fulfilled' && responseTodos.value.ok) {
                        const dataTodos = await responseTodos.value.json();
                        todosFormateados = dataTodos.map((c, index) => formatearCliente(c, index, false));
                    }

                    const clientesDelDiaFormateados = dataDia.map((c, index) => formatearCliente(c, index, true));

                    // 🆕 El servidor ya devuelve solo los clientes del día, ordenados
                    setClientesDelDia(clientesDelDiaFormateados);
                    if (todosFormateados) {
                        setTodosLosClientes(todosFormateados);
                    }
                    console.log(`📥 Clientes del ${dia} cargados y ordenados:`, clientesDelDiaFormateados.length);

                    // Guardar en cache separado por tipo
                    const { cacheKeyTodos, cacheKeyDia } = construirCacheKeys(dia);
                    await AsyncStorage.setItem(cacheKeyDia, JSON.stringify({
                        clientes: clientesDelDiaFormateados,
                        timestamp: Date.now()
                    }));

                    if (todosFormateados) {
                        await AsyncStorage.setItem(cacheKeyTodos, JSON.stringify({
                            clientes: todosFormateados,
                            timestamp: Date.now()
                        }));
                    }
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    console.log('⏱️ Timeout cargando clientes del servidor');
                } else {
                    throw fetchError;
                }
            }
        } catch (error) {
            console.log('❌ Error cargando clientes:', error?.message || error);
        } finally {
            setLoading(false);
        }
    };

    const clientesDelDiaConPedidos = useMemo(() => {
        const baseDia = Array.isArray(clientesDelDia) ? clientesDelDia : [];
        const listaTodos = Array.isArray(todosLosClientes) ? todosLosClientes : [];
        const pedidos = Array.isArray(pedidosPendientes) ? pedidosPendientes : [];

        if (pedidos.length === 0) {
            return baseDia;
        }

        const norm = (txt) => (txt || '').toString().trim().toUpperCase();
        const coincideClientePedido = (cliente, pedido) => {
            const destinatario = norm(pedido?.destinatario);
            if (!destinatario) return false;
            return destinatario === norm(cliente?.negocio) || destinatario === norm(cliente?.nombre);
        };

        const idsEnBase = new Set(baseDia.map((c) => String(c.id)));
        const extras = [];

        pedidos.forEach((pedido) => {
            const yaEstaEnDia = baseDia.some((cliente) => coincideClientePedido(cliente, pedido));
            if (yaEstaEnDia) return;

            const candidato = listaTodos.find((cliente) => coincideClientePedido(cliente, pedido));
            if (!candidato) return;

            const candidatoId = String(candidato.id);
            if (idsEnBase.has(candidatoId)) return;

            idsEnBase.add(candidatoId);
            extras.push(candidato);
        });

        if (extras.length === 0) {
            return baseDia;
        }

        // Primero mostramos los que tienen pedido pendiente, luego el orden normal del día.
        return [...extras, ...baseDia];
    }, [clientesDelDia, todosLosClientes, pedidosPendientes]);

    const clientesVistaHoy = useMemo(() => {
        const baseHoy = Array.isArray(clientesDelDiaConPedidos) ? clientesDelDiaConPedidos : [];
        const pedidos = Array.isArray(pedidosPendientes) ? pedidosPendientes : [];
        const entregados = Array.isArray(pedidosEntregadosHoy) ? pedidosEntregadosHoy : [];
        const noEntregados = Array.isArray(pedidosNoEntregadosHoy) ? pedidosNoEntregadosHoy : [];
        const listaTodos = Array.isArray(todosLosClientes) ? todosLosClientes : [];

        const norm = (txt) => (txt || '').toString().trim().toUpperCase();
        const coincide = (cliente, pedido) => {
            const destinatario = norm(pedido?.destinatario);
            return destinatario && (destinatario === norm(cliente?.negocio) || destinatario === norm(cliente?.nombre));
        };

        // Si hay eventos (entregado/no entregado/pendiente) de un cliente fuera del día,
        // lo inyectamos desde "Todos" para que no desaparezca del selector.
        const idsBase = new Set(baseHoy.map((c) => String(c?.id || '')));
        const baseConEventos = [...baseHoy];
        const eventos = [...pedidos, ...entregados, ...noEntregados];

        eventos.forEach((evento) => {
            const yaEsta = baseConEventos.some((cliente) => coincide(cliente, evento));
            if (yaEsta) return;

            const candidato = listaTodos.find((cliente) => coincide(cliente, evento));
            if (!candidato) return;

            const id = String(candidato?.id || '');
            if (idsBase.has(id)) return;
            idsBase.add(id);
            baseConEventos.push(candidato);
        });

        const obtenerPuntajePedido = (pedido) => {
            const estado = (pedido?.estado || '').toString().toUpperCase();
            const prioridadEstado = estado === 'ANULADA' ? 0 : 1;
            const numeroPedido = parseInt(String(pedido?.numero_pedido || '').replace(/\D/g, ''), 10);
            const numeroNormalizado = Number.isFinite(numeroPedido) ? numeroPedido : 0;
            const fecha = new Date(pedido?.fecha_actualizacion || pedido?.fecha || 0).getTime() || 0;
            const id = Number(pedido?.id) || 0;
            return { prioridadEstado, numeroNormalizado, fecha, id };
        };

        return baseConEventos.flatMap((cliente) => {
            const ordenarPedidosDesc = (lista) =>
                lista.slice().sort((a, b) => {
                    const pa = obtenerPuntajePedido(a);
                    const pb = obtenerPuntajePedido(b);
                    if (pb.prioridadEstado !== pa.prioridadEstado) return pb.prioridadEstado - pa.prioridadEstado;
                    if (pb.numeroNormalizado !== pa.numeroNormalizado) return pb.numeroNormalizado - pa.numeroNormalizado;
                    if (pb.fecha !== pa.fecha) return pb.fecha - pa.fecha;
                    return pb.id - pa.id;
                });

            const pedidosCliente = pedidos.filter((p) => coincide(cliente, p));
            const pendientesReales = ordenarPedidosDesc(
                pedidosCliente.filter((p) => (p?.estado || '').toString().toUpperCase() !== 'ANULADA')
            );
            const entregadosCliente = ordenarPedidosDesc(entregados.filter((p) => coincide(cliente, p)));
            const noEntregadosCliente = ordenarPedidosDesc(noEntregados.filter((p) => coincide(cliente, p)));

            const idBase = String(cliente?.id || '');
            const filas = [];

            // Mostrar todos los entregados (ej: #47 y #48) para trazabilidad visual.
            entregadosCliente.forEach((pedidoEntregado, idx) => {
                const clavePedido = String(pedidoEntregado?.id || pedidoEntregado?.numero_pedido || idx);
                filas.push({
                    ...cliente,
                    __vistaTipo: 'ENTREGADO',
                    __pedidoVista: pedidoEntregado,
                    __vistaKey: `${idBase}-ENTREGADO-${clavePedido}`,
                });
            });

            if (pendientesReales.length > 0) {
                filas.push({
                    ...cliente,
                    __vistaTipo: 'PENDIENTE',
                    __pedidoVista: pendientesReales[0],
                    __cantidadPendientes: pendientesReales.length,
                    __vistaKey: `${idBase}-PENDIENTE`,
                });
                return filas;
            }

            if (noEntregadosCliente.length > 0) {
                const pedidoNoEntregado = noEntregadosCliente[0];
                const clavePedido = String(pedidoNoEntregado?.id || pedidoNoEntregado?.numero_pedido || '1');
                filas.push({
                    ...cliente,
                    __vistaTipo: 'NO_ENTREGADO',
                    __pedidoVista: pedidoNoEntregado,
                    __vistaKey: `${idBase}-NO_ENTREGADO-${clavePedido}`,
                });
                return filas;
            }

            if (filas.length > 0) {
                return filas;
            }

            return [{
                ...cliente,
                __vistaTipo: 'NORMAL',
                __vistaKey: `${idBase}-NORMAL`,
            }];
        });
    }, [clientesDelDiaConPedidos, todosLosClientes, pedidosPendientes, pedidosEntregadosHoy, pedidosNoEntregadosHoy]);

    // 🚀 OPTIMIZACIÓN: useMemo para evitar recalcular filtro en cada render
    const clientesFiltrados = useMemo(() => {
        const listaBase = mostrarTodos ? todosLosClientes : clientesVistaHoy;

        if (busqueda.trim() === '') {
            return listaBase;
        }

        const queryLower = busqueda.toLowerCase();
        return listaBase.filter(c =>
            c.nombre?.toLowerCase().includes(queryLower) ||
            c.negocio?.toLowerCase().includes(queryLower) ||
            c.direccion?.toLowerCase().includes(queryLower)
        );
    }, [clientesVistaHoy, todosLosClientes, busqueda, mostrarTodos]);

    // 🚀 Índice O(1) para evitar findIndex por cada card
    const indiceClientesDiaMap = useMemo(() => {
        const mapa = new Map();
        (Array.isArray(clientesDelDia) ? clientesDelDia : []).forEach((cliente, idx) => {
            mapa.set(String(cliente?.id), idx);
        });
        return mapa;
    }, [clientesDelDia]);

    // 🚀 Pre-indexar ventas para evitar filtros pesados por item
    const ventasPorCliente = useMemo(() => {
        const mapa = new Map();
        const anuladas = new Set();

        const registrarClave = (setObj, negocio, nombre) => {
            if (negocio) setObj.add(`neg:${negocio}`);
            if (nombre) setObj.add(`nom:${nombre}`);
        };

        const registrarVenta = (negocio, nombre, total) => {
            const venta = { total };
            if (negocio && !mapa.has(`neg:${negocio}`)) mapa.set(`neg:${negocio}`, venta);
            if (nombre && !mapa.has(`nom:${nombre}`)) mapa.set(`nom:${nombre}`, venta);
        };

        (Array.isArray(ventasBackend) ? ventasBackend : []).forEach((venta) => {
            if ((venta?.estado || '').toString().toUpperCase() !== 'ANULADA') return;
            registrarClave(
                anuladas,
                normalizarTexto(venta?.nombre_negocio || venta?.cliente_negocio),
                normalizarTexto(venta?.cliente_nombre)
            );
        });

        (Array.isArray(ventasDelDia) ? ventasDelDia : []).forEach((venta) => {
            if ((venta?.estado || '').toString().toUpperCase() === 'ANULADA') return;
            const negocio = normalizarTexto(venta?.cliente_negocio || venta?.nombre_negocio);
            const nombre = normalizarTexto(venta?.cliente_nombre);
            const estaAnulada = (negocio && anuladas.has(`neg:${negocio}`)) || (nombre && anuladas.has(`nom:${nombre}`));
            if (estaAnulada) return;
            registrarVenta(negocio, nombre, venta?.total);
        });

        (Array.isArray(ventasBackend) ? ventasBackend : []).forEach((venta) => {
            if ((venta?.estado || '').toString().toUpperCase() === 'ANULADA') return;
            const negocio = normalizarTexto(venta?.nombre_negocio || venta?.cliente_negocio);
            const nombre = normalizarTexto(venta?.cliente_nombre);
            registrarVenta(negocio, nombre, venta?.total);
        });

        return mapa;
    }, [ventasDelDia, ventasBackend]);

    // 🚀 Pre-indexar pedidos para evitar filter/find en cada render de card
    const pedidosPorCliente = useMemo(() => {
        const pendientes = new Map();
        const entregados = new Map();
        const noEntregados = new Map();

        const puntajePedido = (pedido) => {
            const estado = (pedido?.estado || '').toString().toUpperCase();
            const prioridadEstado = estado === 'ANULADA' ? 0 : 1;
            const numeroPedido = parseInt(String(pedido?.numero_pedido || '').replace(/\D/g, ''), 10);
            const numeroNormalizado = Number.isFinite(numeroPedido) ? numeroPedido : 0;
            const fecha = new Date(pedido?.fecha_actualizacion || pedido?.fecha || 0).getTime() || 0;
            const id = Number(pedido?.id) || 0;
            return { prioridadEstado, numeroNormalizado, fecha, id };
        };

        const comparar = (a, b) => {
            const pa = puntajePedido(a);
            const pb = puntajePedido(b);
            if (pb.prioridadEstado !== pa.prioridadEstado) return pb.prioridadEstado - pa.prioridadEstado;
            if (pb.numeroNormalizado !== pa.numeroNormalizado) return pb.numeroNormalizado - pa.numeroNormalizado;
            if (pb.fecha !== pa.fecha) return pb.fecha - pa.fecha;
            return pb.id - pa.id;
        };

        const agregar = (mapa, pedido) => {
            const destinatario = normalizarTexto(pedido?.destinatario);
            if (!destinatario) return;
            if (!mapa.has(destinatario)) mapa.set(destinatario, []);
            mapa.get(destinatario).push(pedido);
        };

        (Array.isArray(pedidosPendientes) ? pedidosPendientes : []).forEach((pedido) => {
            if ((pedido?.estado || '').toString().toUpperCase() === 'ANULADA') return;
            agregar(pendientes, pedido);
        });

        (Array.isArray(pedidosEntregadosHoy) ? pedidosEntregadosHoy : []).forEach((pedido) => agregar(entregados, pedido));
        (Array.isArray(pedidosNoEntregadosHoy) ? pedidosNoEntregadosHoy : []).forEach((pedido) => agregar(noEntregados, pedido));

        pendientes.forEach((lista) => lista.sort(comparar));
        entregados.forEach((lista) => lista.sort(comparar));
        noEntregados.forEach((lista) => lista.sort(comparar));

        return { pendientes, entregados, noEntregados };
    }, [pedidosPendientes, pedidosEntregadosHoy, pedidosNoEntregadosHoy]);

    useEffect(() => {
        if (typeof onClientesDiaActualizados === 'function') {
            onClientesDiaActualizados(clientesDelDia);
        }
    }, [clientesDelDia, onClientesDiaActualizados]);

    const handleSelectCliente = (cliente) => {
        // ✅ OPTIMIZACIÓN: Cerrar modal PRIMERO para dar sensación de rapidez
        onClose();
        setBusqueda('');
        setMostrarTodos(false);

        // Ejecutar callback en el siguiente tick para no bloquear el cierre del modal
        setTimeout(() => {
            onSelectCliente(cliente);
        }, 0);
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
        const negocioNorm = normalizarTexto(item?.negocio);
        const nombreNorm = normalizarTexto(item?.nombre);
        const ventaRealizada =
            ventasPorCliente.get(`neg:${negocioNorm}`) ||
            ventasPorCliente.get(`nom:${nombreNorm}`) ||
            null;

        const yaVendido = !!ventaRealizada;

        const pedidosPendientesReales =
            pedidosPorCliente.pendientes.get(negocioNorm) ||
            pedidosPorCliente.pendientes.get(nombreNorm) ||
            [];

        let tienePedidosPendientes = pedidosPendientesReales.length > 0;
        let pedido = tienePedidosPendientes ? pedidosPendientesReales[0] : null;
        let cantidadPendientes = pedidosPendientesReales.length;

        // 🆕 Verificar si tiene pedidos entregados
        const entregadosCliente =
            pedidosPorCliente.entregados.get(negocioNorm) ||
            pedidosPorCliente.entregados.get(nombreNorm) ||
            [];
        let pedidoEntregado = entregadosCliente[0] || null;

        // 🆕 Verificar si tiene pedidos NO entregados
        const noEntregadosCliente =
            pedidosPorCliente.noEntregados.get(negocioNorm) ||
            pedidosPorCliente.noEntregados.get(nombreNorm) ||
            [];
        let pedidoNoEntregado = noEntregadosCliente[0] || null;

        const vistaTipo = (item?.__vistaTipo || '').toString().toUpperCase();
        if (!mostrarTodos && vistaTipo) {
            if (vistaTipo === 'PENDIENTE') {
                tienePedidosPendientes = true;
                pedido = item?.__pedidoVista || pedido;
                cantidadPendientes = item?.__cantidadPendientes || cantidadPendientes || 1;
                pedidoEntregado = null;
                pedidoNoEntregado = null;
            } else if (vistaTipo === 'ENTREGADO') {
                tienePedidosPendientes = false;
                pedido = null;
                cantidadPendientes = 0;
                pedidoEntregado = item?.__pedidoVista || pedidoEntregado;
                pedidoNoEntregado = null;
            } else if (vistaTipo === 'NO_ENTREGADO') {
                tienePedidosPendientes = false;
                pedido = null;
                cantidadPendientes = 0;
                pedidoEntregado = null;
                pedidoNoEntregado = item?.__pedidoVista || pedidoNoEntregado;
            } else if (vistaTipo === 'NORMAL') {
                tienePedidosPendientes = false;
                pedido = null;
                cantidadPendientes = 0;
                pedidoEntregado = null;
                pedidoNoEntregado = null;
            }
        }

        const indiceOrdenBase = indiceClientesDiaMap.get(String(item?.id)) ?? -1;
        const puedeOrdenar = indiceOrdenBase >= 0;
        // 🆕 Variables para ordenamiento (solo si estamos en Hoy y sin búsqueda)
        const mostrarFlechas = !mostrarTodos && busqueda.trim() === '' && puedeOrdenar;

        // 🆕 Variables para Movimiento Rápido
        const isDragging = dragTarget && dragTarget.original === indiceOrdenBase;
        const currentDisplayIndex = isDragging ? dragTarget.destino : indiceOrdenBase;

        const esPrimero = currentDisplayIndex <= 0;
        const esUltimo = currentDisplayIndex >= (clientesDelDia.length - 1);

        // Si tiene pedidos pendientes reales, siempre priorizar card pendiente
        if (tienePedidosPendientes && pedido) {
            return (
                <TouchableOpacity
                    style={[
                        styles.clienteItem,
                        styles.clienteItemConPedido, // Fondo naranja para pendiente
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
                                onPressIn={() => startRapidMove(indiceOrdenBase, -1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(indiceOrdenBase, -1)} // 🚀 Fin Hold
                                disabled={esPrimero}
                            >
                                <Ionicons name="chevron-up" size={24} color={esPrimero ? "#eee" : "#ff9800"} />
                            </TouchableOpacity>
                            <Text style={[
                                styles.indiceMini,
                                { color: '#003d88' },
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
                                onPressIn={() => startRapidMove(indiceOrdenBase, 1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(indiceOrdenBase, 1)} // 🚀 Fin Hold
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
                            📦 Pedido #{pedido.numero_pedido}{cantidadPendientes > 1 ? ` (+${cantidadPendientes - 1})` : ''}
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

        // 🆕 Si tiene pedido NO entregado y no hay pendiente real, mostrar card roja
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
                                onPressIn={() => startRapidMove(indiceOrdenBase, -1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(indiceOrdenBase, -1)} // 🚀 Fin Hold
                                disabled={esPrimero}
                            >
                                <Ionicons name="chevron-up" size={24} color={esPrimero ? "#eee" : "#dc3545"} />
                            </TouchableOpacity>
                            <Text style={[
                                styles.indiceMini,
                                { color: '#003d88' },
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
                                onPressIn={() => startRapidMove(indiceOrdenBase, 1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(indiceOrdenBase, 1)} // 🚀 Fin Hold
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

        // Si solo tiene entregados, mostrar card verde
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
                                onPressIn={() => startRapidMove(indiceOrdenBase, -1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(indiceOrdenBase, -1)} // 🚀 Fin Hold
                                disabled={esPrimero}
                            >
                                <Ionicons name="chevron-up" size={24} color={esPrimero ? "#eee" : "#22c55e"} />
                            </TouchableOpacity>
                            <Text style={[
                                styles.indiceMini,
                                { color: '#003d88' },
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
                                onPressIn={() => startRapidMove(indiceOrdenBase, 1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(indiceOrdenBase, 1)} // 🚀 Fin Hold
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
                activeOpacity={0.6}
                delayPressIn={0}
            >
                {/* 🆕 Columna de Flechas de Ordenamiento (Izquierda) */}
                {mostrarFlechas && (
                    <View
                        style={styles.columnaFlechas}
                        onStartShouldSetResponder={() => true}
                    >
                        <TouchableOpacity
                            style={[styles.btnFlechaMini, esPrimero && styles.btnFlechaDeshabilitado]}
                                onPressIn={() => startRapidMove(indiceOrdenBase, -1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(indiceOrdenBase, -1)} // 🚀 Fin Hold
                            disabled={esPrimero}
                        >
                            <Ionicons name="chevron-up" size={24} color={esPrimero ? "#eee" : "#003d88"} />
                        </TouchableOpacity>

                        {/* Número índice pequeño (opcional, ayuda visual) */}
                        <Text style={[
                            styles.indiceMini,
                            { color: '#003d88' },
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
                                onPressIn={() => startRapidMove(indiceOrdenBase, 1)} // 🚀 Inicio Hold
                                onPressOut={() => stopRapidMove(indiceOrdenBase, 1)} // 🚀 Fin Hold
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

    return (
        <Modal
            visible={visible}
            animationType="none"
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
                        <Text style={[styles.tabTexto, !mostrarTodos && styles.tabTextoActivo]}>
                            Hoy ({diaActual})
                        </Text>
                        <View style={[styles.badge, !mostrarTodos && styles.badgeActivo]}>
                            <Text style={[styles.badgeTexto, !mostrarTodos && styles.badgeTextoActivo]}>
                                {clientesVistaHoy.length}
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

                {/* Botones de Acción */}
                <View style={styles.botonesAccion}>
                    {/* 🆕 Botón Actualizar Lista */}
                    <TouchableOpacity
                        style={[styles.btnAccion, { backgroundColor: actualizandoManual ? '#ccc' : '#003d88' }]}
                        onPress={async () => {
                            if (actualizandoManual || actualizandoEnFondo) return;
                            await actualizarClientesEnFondo(diaActual, true); // true = accion manual
                            if (typeof onActualizarPedidos === 'function') {
                                await onActualizarPedidos();
                            }
                        }}
                        disabled={actualizandoManual}
                    >
                        <Ionicons
                            name={actualizandoManual ? "sync" : "refresh"}
                            size={20}
                            color="white"
                        />
                        <Text style={styles.btnAccionTexto}>
                            {actualizandoManual ? 'Actualizando...' : 'Actualizar'}
                        </Text>
                    </TouchableOpacity>

                    {/* Botón Nuevo Cliente */}
                    <TouchableOpacity
                        style={[styles.btnAccion, { backgroundColor: '#00ad53' }]}
                        onPress={handleNuevoCliente}
                    >
                        <Ionicons name="add-circle" size={20} color="white" />
                        <Text style={styles.btnAccionTexto}>Nuevo Cliente</Text>
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
                        keyExtractor={(item) => item.__vistaKey || item.id}
                        style={styles.lista}
                        contentContainerStyle={styles.listaContent}
                        extraData={clientesDelDia} // Para actualizar ordenamiento
                        initialNumToRender={8}
                        maxToRenderPerBatch={8}
                        windowSize={5}
                        updateCellsBatchingPeriod={40}
                        removeClippedSubviews={true}
                        keyboardShouldPersistTaps="handled"
                        getItemLayout={(data, index) => ({
                            length: ITEM_HEIGHT_ESTIMADO,
                            offset: ITEM_HEIGHT_ESTIMADO * index,
                            index,
                        })}
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
    botonesAccion: {
        flexDirection: 'row', // 🆕 Botones en fila
        paddingHorizontal: 10,
        paddingVertical: 8,
        gap: 10, // Espacio entre botones
    },
    btnAccion: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        borderRadius: 8,
        gap: 6,
    },
    btnAccionTexto: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
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
        fontSize: 16,
        fontWeight: '800',
        color: '#003d88',
        marginVertical: 0, // El espacio lo da el space-between
    },
    btnFlechaDeshabilitado: {
        opacity: 0, // Totalmente invisible si no se puede usar
    },
});

export default ClienteSelector;
