import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Modal,
    Image,
    Alert,
    ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { obtenerProductos, formatearMoneda } from '../../services/ventasService';
import { API_URL } from '../../config'; // 🆕 Import estático en lugar de dinámico

const DevolucionesVencidas = ({
    visible,
    onClose,
    onGuardar,
    tipo = 'devoluciones',
    datosGuardados = [],
    fotosGuardadas = {},
    userId,
    fechaSeleccionada,
    modoSoloRegistro = false, // 🆕 Modo directo sin "completar venta"
    clienteId = null, // 🆕 ID del cliente para modo registro directo
    onVencidasRegistradas = null // 🆕 Callback cuando se completa registro directo
}) => {
    const [cantidades, setCantidades] = useState({});
    const [fotos, setFotos] = useState({}); // { productoId: [uri1, uri2, ...] }
    const productos = obtenerProductos();

    // Cargar datos guardados cuando se abre el modal
    useEffect(() => {
        if (visible) {
            // Reconstruir cantidades desde datosGuardados
            const cantidadesGuardadas = {};
            datosGuardados.forEach(item => {
                cantidadesGuardadas[item.id] = item.cantidad;
            });
            setCantidades(cantidadesGuardadas);

            // Cargar fotos guardadas
            setFotos(fotosGuardadas || {});

            // 🆕 Solicitar permisos de cámara anticipadamente
            (async () => {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    console.log('⚠️ Permiso de cámara no otorgado');
                }
            })();
        }
    }, [visible, datosGuardados, fotosGuardadas]);

    const handleCantidadChange = (productoId, cantidad) => {
        const nuevasCantidades = { ...cantidades };
        if (cantidad === 0 || cantidad === '') {
            delete nuevasCantidades[productoId];
        } else {
            nuevasCantidades[productoId] = parseInt(cantidad) || 0;
        }
        setCantidades(nuevasCantidades);
    };

    // 🆕 Función para comprimir imagen
    const comprimirImagen = async (uri) => {
        try {
            const resultado = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width: 800 } }], // Redimensionar a 800px de ancho
                { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG } // 60% calidad
            );
            console.log('📦 Imagen comprimida:', resultado.uri);
            return resultado.uri;
        } catch (error) {
            console.warn('⚠️ Error comprimiendo imagen, usando original:', error);
            return uri; // Si falla, usar la original
        }
    };

    const tomarFoto = async (productoId) => {
        try {
            // 🆕 Abrir cámara directamente (permisos ya se pidieron al abrir el modal)
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.5, // Calidad media inicial
                base64: false,
                exif: false,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                // 🆕 Comprimir la imagen antes de guardar
                const uriOriginal = result.assets[0].uri;
                const uriComprimida = await comprimirImagen(uriOriginal);

                const nuevasFotos = { ...fotos };
                if (!nuevasFotos[productoId]) {
                    nuevasFotos[productoId] = [];
                }
                nuevasFotos[productoId].push(uriComprimida);
                setFotos(nuevasFotos);
                console.log('📸 Foto tomada y comprimida para producto:', productoId);
            }
        } catch (error) {
            console.error('❌ Error al tomar foto:', error);
            // Si falla por permisos, pedirlos de nuevo
            if (error.message?.includes('permission')) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permiso denegado', 'Se necesita permiso para usar la cámara');
                }
            } else {
                Alert.alert('Error', 'No se pudo tomar la foto');
            }
        }
    };

    const eliminarFoto = (productoId, fotoIndex) => {
        const nuevasFotos = { ...fotos };
        nuevasFotos[productoId].splice(fotoIndex, 1);
        if (nuevasFotos[productoId].length === 0) {
            delete nuevasFotos[productoId];
        }
        setFotos(nuevasFotos);
    };

    const handleGuardar = async () => {
        // Filtrar solo productos con cantidad > 0
        const productosConCantidad = Object.keys(cantidades)
            .filter(id => cantidades[id] > 0)
            .map(id => {
                const producto = productos.find(p => p.id === parseInt(id));
                return {
                    id: producto.id,
                    nombre: producto.nombre,
                    cantidad: cantidades[id]
                };
            });

        // Si es vencidas, validar que cada producto tenga al menos una foto
        if (tipo === 'vencidas' && productosConCantidad.length > 0) {
            for (const prod of productosConCantidad) {
                if (!fotos[prod.id] || fotos[prod.id].length === 0) {
                    Alert.alert(
                        'Foto requerida',
                        `Debe tomar al menos una foto del producto: ${prod.nombre}`
                    );
                    return;
                }
            }

            // 🆕 MODO SOLO REGISTRO: Enviar directamente al backend
            if (modoSoloRegistro) {
                try {
                    console.log(`📤 Enviando vencidas directamente (${productosConCantidad.length} productos)`);

                    // Format productos vencidos para el backend
                    const productosVencidosFormateados = productosConCantidad.map(item => ({
                        id: item.id,
                        producto: item.nombre,
                        cantidad: item.cantidad,
                        motivo: 'Devolución al entregar pedido'
                    }));

                    // 🆕 Convertir fotos a base64 para el backend
                    const fotosBase64 = {};
                    for (const [prodId, uris] of Object.entries(fotos)) {
                        fotosBase64[prodId] = [];
                        for (const uri of uris) {
                            try {
                                // Leer archivo y convertir a base64
                                const response = await fetch(uri);
                                const blob = await response.blob();
                                const base64 = await new Promise((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });
                                fotosBase64[prodId].push(base64);
                            } catch (error) {
                                console.error('Error convirtiendo foto a base64:', error);
                            }
                        }
                    }

                    // Crear venta ficticia de $0 solo con vencidas
                    const ventaVencidas = {
                        id_local: `VENC-${Date.now()}`, // ID único
                        vendedor_id: userId,
                        cliente_nombre: clienteId ? `Cliente ID ${clienteId}` : 'Sin cliente',
                        nombre_negocio: '',
                        total: 0, // Sin venta, solo vencidas
                        detalles: [], // Sin productos vendidos
                        metodo_pago: 'N/A',
                        productos_vencidos: productosVencidosFormateados,
                        foto_vencidos: fotosBase64, // 🆕 Fotos en base64
                        fecha: fechaSeleccionada.toISOString()
                    };

                    const response = await fetch(`${API_URL}/ventas-ruta/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(ventaVencidas),
                    });

                    console.log('📡 Response status:', response.status);
                    console.log('📡 Response headers:', response.headers);

                    // Leer respuesta como texto primero para ver qué devuelve
                    const responseText = await response.text();
                    console.log('📡 Response text:', responseText.substring(0, 500)); // Primeros 500 caracteres

                    let data;
                    try {
                        data = JSON.parse(responseText);
                    } catch (parseError) {
                        console.error('❌ Error parseando JSON:', parseError);
                        console.error('📄 Respuesta completa:', responseText);
                        throw new Error('El servidor no devolvió JSON válido');
                    }


                    if (response.ok) {
                        Alert.alert(
                            '✅ Vencidas Registradas',
                            `${productosConCantidad.length} producto(s) registrados correctamente.`,
                            [{
                                text: 'OK', onPress: () => {
                                    setCantidades({});
                                    setFotos({});
                                    onClose();
                                    if (onGuardar) onGuardar([], {}); // Limpiar en padre
                                    // 🆕 Llamar callback para completar flujo (marcar pedido como entregado)
                                    if (onVencidasRegistradas) onVencidasRegistradas();
                                }
                            }]
                        );
                    } else {
                        throw new Error(data.error || 'Error al registrar vencidas');
                    }
                } catch (error) {
                    console.error('❌ Error enviando vencidas:', error);
                    Alert.alert('Error', 'No se pudieron registrar las vencidas. Intenta de nuevo.');
                }
                return;
            }

            // MODO NORMAL: Solo guardar localmente
            console.log(`📝 Vencidas registradas localmente (${productosConCantidad.length} productos)`);
            console.log(`📸 Fotos adjuntas:`, Object.keys(fotos).length);
            Alert.alert(
                '✅ Registrado',
                `${productosConCantidad.length} producto(s) con vencidas.\nSe enviarán al confirmar la venta.`,
                [{ text: 'OK' }]
            );
        }

        // Si no hay productos (limpiando), mostrar mensaje diferente
        if (productosConCantidad.length === 0 && datosGuardados.length > 0) {
            Alert.alert('Listo', 'Vencidas eliminadas');
        }

        // Guardar localmente en el componente padre
        onGuardar(productosConCantidad, fotos);
        setCantidades({});
        setFotos({});
        onClose();
    };

    const handleCancelar = () => {
        setCantidades({});
        setFotos({});
        onClose();
    };

    const totalProductos = Object.values(cantidades).reduce((sum, val) => sum + (val || 0), 0);

    const renderProducto = ({ item }) => {
        const cantidad = cantidades[item.id] || 0;
        const fotosProducto = fotos[item.id] || [];

        return (
            <View style={styles.productoItem}>
                <View style={styles.productoHeader}>
                    <View style={styles.productoInfo}>
                        <Text style={styles.productoNombre}>{item.nombre}</Text>
                    </View>

                    <View style={styles.cantidadControl}>
                        <TouchableOpacity
                            style={[styles.btnCantidad, cantidad === 0 && styles.btnDeshabilitado]}
                            onPress={() => handleCantidadChange(item.id, cantidad - 1)}
                            disabled={cantidad === 0}
                        >
                            <Ionicons name="remove" size={18} color={cantidad === 0 ? '#ccc' : 'white'} />
                        </TouchableOpacity>

                        <TextInput
                            style={styles.inputCantidad}
                            value={String(cantidad)}
                            onChangeText={(texto) => {
                                const num = parseInt(texto) || 0;
                                handleCantidadChange(item.id, num);
                            }}
                            keyboardType="numeric"
                            selectTextOnFocus
                        />

                        <TouchableOpacity
                            style={styles.btnCantidad}
                            onPress={() => handleCantidadChange(item.id, cantidad + 1)}
                        >
                            <Ionicons name="add" size={18} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Sección de fotos (solo si es vencidas y tiene cantidad > 0) */}
                {tipo === 'vencidas' && cantidad > 0 && (
                    <View style={styles.fotosSection}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {fotosProducto.map((uri, index) => (
                                <View key={index} style={styles.fotoMiniatura}>
                                    <Image source={{ uri }} style={styles.fotoMiniaturaImagen} />
                                    <TouchableOpacity
                                        style={styles.btnEliminarMiniatura}
                                        onPress={() => eliminarFoto(item.id, index)}
                                    >
                                        <Ionicons name="close-circle" size={20} color="white" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                            <TouchableOpacity
                                style={styles.btnAgregarFoto}
                                onPress={() => tomarFoto(item.id)}
                            >
                                <Ionicons name="camera" size={24} color="#003d88" />
                                <Text style={styles.btnAgregarFotoTexto}>
                                    {fotosProducto.length > 0 ? '+' : 'Foto'}
                                </Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                )}
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={handleCancelar}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleCancelar} style={styles.btnCerrar}>
                        <Ionicons name="close" size={28} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.titulo}>
                        {tipo === 'devoluciones' ? 'Devoluciones' : 'Productos Vencidos'}
                    </Text>
                    <View style={{ width: 28 }} />
                </View>

                {/* Resumen */}
                <View style={styles.resumenContainer}>
                    <Ionicons
                        name={tipo === 'devoluciones' ? 'return-down-back' : 'alert-circle'}
                        size={24}
                        color={tipo === 'devoluciones' ? '#ff6b6b' : '#f59e0b'}
                    />
                    <Text style={styles.resumenTexto}>
                        Total productos: <Text style={styles.resumenNumero}>{totalProductos}</Text>
                    </Text>
                </View>

                {/* Lista de productos */}
                <FlatList
                    data={productos}
                    renderItem={renderProducto}
                    keyExtractor={(item) => String(item.id)}
                    style={styles.lista}
                    contentContainerStyle={styles.listaContent}
                />

                {/* Footer con botones */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.btnCancelar}
                        onPress={handleCancelar}
                    >
                        <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.btnGuardar}
                        onPress={handleGuardar}
                    >
                        <Ionicons name="checkmark-circle" size={20} color="white" />
                        <Text style={styles.btnGuardarTexto}>
                            {totalProductos === 0 ? 'Limpiar' :
                                modoSoloRegistro ? `Registrar Vencidas (${totalProductos})` :
                                    `Guardar (${totalProductos})`}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
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
        paddingTop: 50,
        paddingHorizontal: 15,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    btnCerrar: {
        padding: 5,
    },
    titulo: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    resumenContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 15,
        marginBottom: 1,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    resumenTexto: {
        fontSize: 16,
        color: '#666',
        marginLeft: 10,
    },
    resumenNumero: {
        fontWeight: 'bold',
        color: '#333',
        fontSize: 18,
    },
    lista: {
        flex: 1,
    },
    listaContent: {
        padding: 15,
    },
    productoItem: {
        backgroundColor: 'white',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        elevation: 1,
    },
    productoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    productoInfo: {
        flex: 1,
    },
    productoNombre: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#333',
    },
    cantidadControl: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    btnCantidad: {
        backgroundColor: '#00ad53',
        borderRadius: 6,
        padding: 6,
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnDeshabilitado: {
        backgroundColor: '#ccc',
    },
    inputCantidad: {
        width: 45,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 'bold',
        marginHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#66b3ff',
        paddingVertical: 4,
    },
    fotosSection: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    fotoMiniatura: {
        width: 80,
        height: 80,
        marginRight: 8,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
    },
    fotoMiniaturaImagen: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    btnEliminarMiniatura: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: 'rgba(255, 0, 0, 0.8)',
        borderRadius: 10,
    },
    btnAgregarFoto: {
        width: 80,
        height: 80,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#003d88',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f8ff',
    },
    btnAgregarFotoTexto: {
        fontSize: 12,
        color: '#003d88',
        fontWeight: 'bold',
        marginTop: 4,
    },
    footer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        gap: 10,
    },
    btnCancelar: {
        flex: 1,
        padding: 15,
        borderRadius: 8,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnCancelarTexto: {
        fontSize: 16,
        fontWeight: '600',
        color: '#666',
    },
    btnGuardar: {
        flex: 1,
        flexDirection: 'row',
        padding: 15,
        borderRadius: 8,
        backgroundColor: '#00ad53',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnGuardarTexto: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        marginLeft: 8,
    },
});

export default DevolucionesVencidas;
