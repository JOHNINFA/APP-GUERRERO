import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, SafeAreaView, StatusBar, Platform, RefreshControl, Modal, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ClienteSelector from './ClienteSelector';
import ClienteModal from './ClienteModal';
import DevolucionesVencidas from './DevolucionesVencidas';
import ResumenVentaModal from './ResumenVentaModal';
import {
    obtenerProductos,
    buscarProductos,
    obtenerClientes,
    calcularSubtotal,
    guardarVenta,
    formatearMoneda,
    sincronizarProductos,
    sincronizarVentasPendientes,
    obtenerVentasPendientes
} from '../../services/ventasService';
import { imprimirTicket } from '../../services/printerService';

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

const VentasScreen = ({ route, userId: userIdProp, vendedorNombre }) => {
    // userId puede venir de route.params o como prop directa
    const userId = route?.params?.userId || userIdProp;

    // Estado para selección de día
    const [mostrarSelectorDia, setMostrarSelectorDia] = useState(true);
    const [diaSeleccionado, setDiaSeleccionado] = useState(null);

    // Estados
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [productos, setProductos] = useState([]);
    const [carrito, setCarrito] = useState({});
    const [descuento, setDescuento] = useState(0);
    const [nota, setNota] = useState('');
    const [clientes, setClientes] = useState([]);

    // Estados para modales
    const [mostrarSelectorCliente, setMostrarSelectorCliente] = useState(false);
    const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
    const [mostrarVencidas, setMostrarVencidas] = useState(false);
    const [mostrarResumen, setMostrarResumen] = useState(false);
    const [ventaTemporal, setVentaTemporal] = useState(null);

    // Estados para vencidas
    const [vencidas, setVencidas] = useState([]);
    const [fotoVencidas, setFotoVencidas] = useState(null);
    
    // Estado para pull to refresh
    const [refreshing, setRefreshing] = useState(false);
    const [ventasPendientes, setVentasPendientes] = useState(0);

    // Obtener día actual
    const getDiaActual = () => {
        return DIAS_MAP[new Date().getDay()];
    };

    // Seleccionar día
    const handleSeleccionarDia = (dia) => {
        setDiaSeleccionado(dia);
        setMostrarSelectorDia(false);
        
        // Si hay cliente preseleccionado desde rutas, usarlo
        if (clientePreseleccionado) {
            cargarDatosConClientePreseleccionado(clientePreseleccionado);
        } else {
            cargarDatos();
        }
        verificarPendientes();
    };

    // Estado para cliente preseleccionado desde rutas
    const [clientePreseleccionado, setClientePreseleccionado] = useState(null);

    // Cargar datos iniciales solo cuando se selecciona un día
    useEffect(() => {
        // Si viene de rutas con cliente preseleccionado, guardar el cliente pero mostrar selector de día
        if (route?.params?.fromRuta && route?.params?.clientePreseleccionado) {
            setClientePreseleccionado(route.params.clientePreseleccionado);
            // Mostrar selector de día normalmente
            setMostrarSelectorDia(true);
        }
    }, [route?.params]);
    
    const cargarDatosConClientePreseleccionado = async (clientePre) => {
        // Cargar productos
        const productosData = obtenerProductos();
        setProductos(productosData);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Buscar si el cliente existe en la lista o crear uno temporal
        const clienteExistente = clientesData.find(c => 
            c.nombre_negocio === clientePre.nombre_negocio || 
            c.id === clientePre.id
        );
        
        if (clienteExistente) {
            setClienteSeleccionado(clienteExistente);
        } else {
            // Usar el cliente de la ruta directamente
            setClienteSeleccionado({
                id: clientePre.id,
                nombre: clientePre.nombre_contacto || clientePre.nombre_negocio,
                nombre_negocio: clientePre.nombre_negocio,
                direccion: clientePre.direccion,
                telefono: clientePre.telefono
            });
        }
        
        verificarPendientes();
    };

    const cargarDatos = async () => {
        // Cargar productos
        const productosData = obtenerProductos();
        setProductos(productosData);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Seleccionar cliente general por defecto
        setClienteSeleccionado(clientesData[0]);
    };
    
    // Verificar ventas pendientes de sincronizar
    const verificarPendientes = async () => {
        const pendientes = await obtenerVentasPendientes();
        setVentasPendientes(pendientes.length);
    };
    
    // Función para sincronizar al arrastrar hacia abajo
    const onRefresh = async () => {
        setRefreshing(true);
        try {
            console.log('🔄 Sincronizando...');
            
            // 1. Sincronizar ventas pendientes
            const resultadoVentas = await sincronizarVentasPendientes();
            
            // 2. Sincronizar productos
            await sincronizarProductos();
            
            // 3. Recargar productos actualizados
            const productosData = obtenerProductos();
            setProductos(productosData);
            
            // 4. Actualizar contador de pendientes
            await verificarPendientes();
            
            // Mostrar resultado
            let mensaje = 'Productos y precios actualizados';
            if (resultadoVentas.sincronizadas > 0) {
                mensaje += `\n✅ ${resultadoVentas.sincronizadas} ventas sincronizadas`;
            }
            if (resultadoVentas.pendientes > 0) {
                mensaje += `\n⏳ ${resultadoVentas.pendientes} ventas pendientes`;
            }
            
            Alert.alert('Sincronización', mensaje);
        } catch (error) {
            console.error('Error sincronizando:', error);
            Alert.alert('Error', 'No se pudo sincronizar');
        } finally {
            setRefreshing(false);
        }
    };

    // Filtrar productos según búsqueda
    const productosFiltrados = busquedaProducto.trim() === ''
        ? productos
        : buscarProductos(busquedaProducto);

    // Obtener cantidad de un producto en el carrito
    const getCantidad = (productoId) => {
        return carrito[productoId] || 0;
    };

    // Actualizar cantidad de un producto
    const actualizarCantidad = (productoId, nuevaCantidad) => {
        if (nuevaCantidad < 0) return;

        const nuevoCarrito = { ...carrito };
        if (nuevaCantidad === 0) {
            delete nuevoCarrito[productoId];
        } else {
            nuevoCarrito[productoId] = nuevaCantidad;
        }
        setCarrito(nuevoCarrito);
    };

    // Calcular totales
    const calcularTotales = () => {
        let subtotal = 0;

        productos.forEach(producto => {
            const cantidad = getCantidad(producto.id);
            if (cantidad > 0) {
                subtotal += producto.precio * cantidad;
            }
        });

        const total = subtotal - descuento;

        return { subtotal, total };
    };

    const { subtotal, total } = calcularTotales();

    // Completar venta
    const completarVenta = async () => {
        // Validar que haya productos en el carrito
        const productosEnCarrito = Object.keys(carrito).filter(id => carrito[id] > 0);

        if (productosEnCarrito.length === 0) {
            Alert.alert('Error', 'Debe agregar al menos un producto a la venta');
            return;
        }

        // Validar cliente
        if (!clienteSeleccionado) {
            Alert.alert('Error', 'Debe seleccionar un cliente');
            return;
        }

        // Preparar datos de la venta
        const productosVenta = productosEnCarrito.map(idStr => {
            const id = parseInt(idStr);
            const producto = productos.find(p => p.id === id);
            const cantidad = carrito[id];

            return {
                id: producto.id,
                nombre: producto.nombre,
                precio: producto.precio,
                cantidad: cantidad,
                subtotal: producto.precio * cantidad
            };
        });

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
        setMostrarResumen(true);
    };

    // Confirmar y guardar venta
    const confirmarVenta = async (fechaSeleccionada, metodoPago, opcionesEnvio) => {
        console.log('🔵 confirmarVenta iniciado');
        if (!ventaTemporal) {
            console.log('❌ No hay ventaTemporal');
            return;
        }

        // Agregar la fecha y método de pago a la venta
        const ventaConDatos = {
            ...ventaTemporal,
            fecha: fechaSeleccionada ? fechaSeleccionada.toISOString() : new Date().toISOString(),
            metodo_pago: metodoPago || 'EFECTIVO'
        };

        console.log('📝 Venta a guardar:', ventaConDatos);

        try {
            console.log('💾 Llamando a guardarVenta...');
            const ventaGuardada = await guardarVenta(ventaConDatos);
            console.log('✅ Venta guardada:', ventaGuardada);

            // Cerrar modal inmediatamente
            setMostrarResumen(false);

            // Actualizar contador de pendientes en segundo plano (no bloquea)
            verificarPendientes();

            // Preparar opciones del alert
            const alertOptions = [
                {
                    text: 'Cerrar',
                    onPress: () => limpiarVenta(),
                    style: 'cancel'
                }
            ];

            // Agregar opción de imprimir
            alertOptions.unshift({
                text: 'Imprimir',
                onPress: async () => {
                    await imprimirTicket(ventaGuardada);
                    limpiarVenta();
                }
            });

            // Agregar opción de WhatsApp si se proporcionó número
            if (opcionesEnvio?.whatsapp) {
                alertOptions.push({
                    text: 'WhatsApp',
                    onPress: () => {
                        enviarFacturaWhatsApp(ventaGuardada, opcionesEnvio.whatsapp);
                    }
                });
            }

            // Agregar opción de Correo si se proporcionó
            if (opcionesEnvio?.correo) {
                alertOptions.push({
                    text: 'Correo',
                    onPress: () => {
                        enviarFacturaCorreo(ventaGuardada, opcionesEnvio.correo);
                    }
                });
            }

            Alert.alert(
                'Venta Completada',
                `Venta ${ventaGuardada.id} guardada exitosamente\nTotal: ${formatearMoneda(ventaConDatos.total)}\nMétodo: ${metodoPago}`,
                alertOptions
            );
        } catch (error) {
            console.error('❌ Error en confirmarVenta:', error);
            Alert.alert('Error', 'No se pudo guardar la venta');
        }
    };

    // Enviar ticket PDF por WhatsApp (abre directamente al número)
    const enviarFacturaWhatsApp = async (venta, numero) => {
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
            
            limpiarVenta();
        } catch (error) {
            console.error('Error al enviar por WhatsApp:', error);
            Alert.alert('Error', 'No se pudo generar el ticket para enviar');
        }
    };

    // Enviar ticket por correo electrónico
    const enviarFacturaCorreo = async (venta, correo) => {
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
            
            limpiarVenta();
        } catch (error) {
            console.error('Error al enviar por correo:', error);
            Alert.alert('Error', 'No se pudo enviar por correo');
        }
    };

    // Limpiar venta
    const limpiarVenta = () => {
        setCarrito({});
        setDescuento(0);
        setCarrito({});
        setDescuento(0);
        setVencidas([]);
        setFotoVencidas(null);
        setVentaTemporal(null);
        setMostrarResumen(false);
        setNota('');
        setBusquedaProducto('');
    };

    // Manejar selección de cliente
    const handleSeleccionarCliente = (cliente) => {
        setClienteSeleccionado(cliente);
    };

    // Manejar cliente guardado
    const handleClienteGuardado = async (nuevoCliente) => {
        setClienteSeleccionado(nuevoCliente);
        // Recargar lista de clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);
    };

    // Manejar vencidas
    const handleGuardarVencidas = (productosVencidos, foto) => {
        setVencidas(productosVencidos);
        setFotoVencidas(foto);
    };

    // Renderizar producto
    const renderProducto = ({ item }) => {
        const cantidad = getCantidad(item.id);
        const subtotalProducto = item.precio * cantidad;

        return (
            <View style={styles.productoItem}>
                <View style={styles.productoInfo}>
                    <Text style={styles.productoNombre}>{item.nombre}</Text>
                    <Text style={styles.productoPrecio}>Precio: {formatearMoneda(item.precio)}</Text>
                    {cantidad > 0 && (
                        <Text style={styles.productoSubtotal}>
                            Total: {formatearMoneda(subtotalProducto)}
                        </Text>
                    )}
                </View>

                <View style={styles.cantidadControl}>
                    <TouchableOpacity
                        style={[styles.btnCantidad, cantidad === 0 && styles.btnDeshabilitado]}
                        onPress={() => actualizarCantidad(item.id, cantidad - 1)}
                        disabled={cantidad === 0}
                    >
                        <Ionicons name="remove" size={20} color={cantidad === 0 ? '#ccc' : 'white'} />
                    </TouchableOpacity>

                    <TextInput
                        style={styles.inputCantidad}
                        value={String(cantidad)}
                        onChangeText={(texto) => {
                            const num = parseInt(texto) || 0;
                            actualizarCantidad(item.id, num);
                        }}
                        keyboardType="numeric"
                        selectTextOnFocus
                    />

                    <TouchableOpacity
                        style={styles.btnCantidad}
                        onPress={() => actualizarCantidad(item.id, cantidad + 1)}
                    >
                        <Ionicons name="add" size={20} color="white" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
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
            
            {/* Header - Cliente */}
            <View style={styles.headerCliente}>
                <TouchableOpacity
                    style={styles.clienteSelector}
                    onPress={() => setMostrarSelectorCliente(true)}
                >
                    <Ionicons name="person" size={20} color="#003d88" />
                    <View style={styles.clienteInfo}>
                        <Text style={styles.clienteNombre}>
                            {clienteSeleccionado?.negocio || 'Seleccionar Cliente'}
                        </Text>
                        {clienteSeleccionado?.nombre && (
                            <Text style={styles.clienteDetalle}>
                                👤 {clienteSeleccionado.nombre}
                            </Text>
                        )}
                        <Text style={styles.clienteDetalle}>
                            📞 {clienteSeleccionado?.celular || 'Sin teléfono'}
                        </Text>
                        <Text style={styles.clienteDetalle}>
                            📍 {clienteSeleccionado?.direccion || 'Sin dirección'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#003d88" />
                </TouchableOpacity>
            </View>

            {/* Botón Vencidas */}
            <View style={styles.botonesAccionesContainer}>
                <TouchableOpacity
                    style={[styles.btnAccion, styles.btnVencidas]}
                    onPress={() => setMostrarVencidas(true)}
                >
                    <Ionicons name="alert-circle" size={18} color="white" />
                    <Text style={styles.btnAccionTexto}>Vencidas</Text>
                    {vencidas.length > 0 && (
                        <View style={styles.badgeAccion}>
                            <Text style={styles.badgeTexto}>
                                {vencidas.reduce((sum, p) => sum + p.cantidad, 0)}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* Búsqueda de productos */}
            <View style={styles.busquedaContainer}>
                <Ionicons name="search" size={20} color="#666" style={styles.iconoBusqueda} />
                <TextInput
                    style={styles.inputBusqueda}
                    placeholder="Buscar producto..."
                    value={busquedaProducto}
                    onChangeText={setBusquedaProducto}
                    autoCapitalize="characters"
                />
                {busquedaProducto.length > 0 && (
                    <TouchableOpacity onPress={() => setBusquedaProducto('')}>
                        <Ionicons name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Lista de productos - Arrastra hacia abajo para sincronizar */}
            <FlatList
                data={productosFiltrados}
                renderItem={renderProducto}
                keyExtractor={(item) => String(item.id)}
                style={styles.listaProductos}
                contentContainerStyle={styles.listaContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#003d88']}
                        tintColor="#003d88"
                        title="Sincronizando productos..."
                        titleColor="#666"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="search-outline" size={48} color="#ccc" />
                        <Text style={styles.emptyText}>No se encontraron productos</Text>
                        <Text style={styles.emptySubtext}>Arrastra hacia abajo para sincronizar</Text>
                    </View>
                }
            />

            {/* Resumen y botón */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.btnCompletar,
                        Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && styles.btnDeshabilitado
                    ]}
                    onPress={completarVenta}
                    disabled={Object.keys(carrito).filter(id => carrito[id] > 0).length === 0}
                >
                    <Ionicons name="checkmark-circle" size={24} color="white" style={styles.iconoBoton} />
                    <Text style={styles.btnCompletarTexto}>
                        COMPLETAR VENTA {formatearMoneda(total)}
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
                    </View>
                </View>
            </Modal>

            {/* Modales */}
            <ClienteSelector
                visible={mostrarSelectorCliente}
                onClose={() => setMostrarSelectorCliente(false)}
                onSelectCliente={handleSeleccionarCliente}
                onNuevoCliente={() => {
                    setMostrarSelectorCliente(false);
                    setMostrarModalCliente(true);
                }}
                userId={userId}
                diaSeleccionado={diaSeleccionado}
            />

            <ClienteModal
                visible={mostrarModalCliente}
                onClose={() => setMostrarModalCliente(false)}
                onClienteGuardado={handleClienteGuardado}
            />



            <DevolucionesVencidas
                visible={mostrarVencidas}
                onClose={() => setMostrarVencidas(false)}
                onGuardar={handleGuardarVencidas}
                tipo="vencidas"
                datosGuardados={vencidas}
                fotosGuardadas={fotoVencidas}
            />

            <ResumenVentaModal
                visible={mostrarResumen}
                onClose={() => setMostrarResumen(false)}
                onConfirmar={confirmarVenta}
                venta={ventaTemporal}
            />
        </View>
    );
};

const styles = StyleSheet.create({
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
    clienteSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#f0f8ff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#003d88',
    },
    clienteInfo: {
        marginLeft: 10,
        flex: 1,
    },
    clienteNombre: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#003d88',
    },
    clienteDetalle: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    busquedaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 10,
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
    listaProductos: {
        flex: 1,
    },
    listaContent: {
        padding: 10,
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
        backgroundColor: '#ff6b6b',
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
});

export default VentasScreen;
