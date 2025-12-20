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
import { obtenerProductos, formatearMoneda } from '../../services/ventasService';
import { API_URL } from '../../config'; // 🆕 Import estático en lugar de dinámico

const DevolucionesVencidas = ({ visible, onClose, onGuardar, tipo = 'devoluciones', datosGuardados = [], fotosGuardadas = {}, userId, fechaSeleccionada }) => {
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

    const tomarFoto = async (productoId) => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Se necesita permiso para usar la cámara');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.1,  // 🔥 Reducido de 0.3 a 0.1 para evitar timeouts
                base64: false,
                exif: false,
            });

            if (!result.canceled) {
                const nuevasFotos = { ...fotos };
                if (!nuevasFotos[productoId]) {
                    nuevasFotos[productoId] = [];
                }
                nuevasFotos[productoId].push(result.assets[0].uri);
                setFotos(nuevasFotos);
            }
        } catch (error) {
            console.error('Error al tomar foto:', error);
            Alert.alert('Error', 'No se pudo tomar la foto');
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

            // 🆕 NUEVO FLUJO: Solo guardar localmente, se enviará al confirmar venta
            console.log(`📝 Vencidas registradas localmente (${productosConCantidad.length} productos)`);
            console.log(`📸 Fotos adjuntas:`, Object.keys(fotos).length);
            Alert.alert(
                '✅ Registrado',
                `${productosConCantidad.length} producto(s) con vencidas.\nSe enviarán al confirmar la venta.`,
                [{ text: 'OK' }]
            );
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
                        style={[
                            styles.btnGuardar,
                            totalProductos === 0 && styles.btnDeshabilitado
                        ]}
                        onPress={handleGuardar}
                        disabled={totalProductos === 0}
                    >
                        <Ionicons name="checkmark-circle" size={20} color="white" />
                        <Text style={styles.btnGuardarTexto}>
                            Guardar ({totalProductos})
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
