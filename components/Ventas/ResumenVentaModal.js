import React from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatearMoneda } from '../../services/ventasService';

const ResumenVentaModal = ({ visible, onClose, onConfirmar, venta }) => {
    if (!venta) return null;

    const {
        cliente_nombre,
        cliente_negocio,
        productos,
        vencidas,
        subtotal,
        descuento,
        total
    } = venta;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.titulo}>Confirmar Venta</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scrollView}>
                        {/* Cliente */}
                        <View style={styles.seccion}>
                            <Text style={styles.label}>Cliente:</Text>
                            <Text style={styles.valor}>{cliente_nombre}</Text>
                            {cliente_negocio && (
                                <Text style={styles.subValor}>{cliente_negocio}</Text>
                            )}
                        </View>

                        <View style={styles.divider} />

                        {/* Productos */}
                        <View style={styles.seccion}>
                            <Text style={styles.seccionTitulo}>Productos a Vender</Text>
                            {productos.map((p, index) => (
                                <View key={index} style={styles.itemRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.itemNombre}>{p.nombre}</Text>
                                        <Text style={styles.itemDetalle}>
                                            {p.cantidad} x {formatearMoneda(p.precio)}
                                        </Text>
                                    </View>
                                    <Text style={styles.itemTotal}>
                                        {formatearMoneda(p.subtotal)}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {/* Vencidas (si hay) */}
                        {vencidas && vencidas.length > 0 && (
                            <>
                                <View style={styles.divider} />
                                <View style={styles.seccion}>
                                    <Text style={[styles.seccionTitulo, { color: '#ff6b6b' }]}>
                                        Productos Vencidos
                                    </Text>
                                    {vencidas.map((v, index) => (
                                        <View key={index} style={styles.itemRow}>
                                            <Text style={styles.itemNombre}>{v.nombre}</Text>
                                            <Text style={styles.itemCantidad}>Cant: {v.cantidad}</Text>
                                        </View>
                                    ))}
                                </View>
                            </>
                        )}

                        <View style={styles.divider} />

                        {/* Totales */}
                        <View style={styles.totalesContainer}>
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>Subtotal:</Text>
                                <Text style={styles.totalValor}>{formatearMoneda(subtotal)}</Text>
                            </View>
                            {descuento > 0 && (
                                <View style={styles.totalRow}>
                                    <Text style={styles.totalLabel}>Descuento:</Text>
                                    <Text style={[styles.totalValor, { color: '#ff6b6b' }]}>
                                        -{formatearMoneda(descuento)}
                                    </Text>
                                </View>
                            )}
                            <View style={[styles.totalRow, { marginTop: 10 }]}>
                                <Text style={styles.granTotalLabel}>TOTAL A PAGAR:</Text>
                                <Text style={styles.granTotalValor}>{formatearMoneda(total)}</Text>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Botones */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.btnEditar}
                            onPress={onClose}
                        >
                            <Ionicons name="create-outline" size={20} color="#003d88" />
                            <Text style={styles.btnEditarTexto}>Editar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.btnConfirmar}
                            onPress={onConfirmar}
                        >
                            <Ionicons name="checkmark-circle" size={20} color="white" />
                            <Text style={styles.btnConfirmarTexto}>Confirmar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 15,
        width: '100%',
        maxHeight: '80%',
        elevation: 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    titulo: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    scrollView: {
        padding: 15,
    },
    seccion: {
        marginBottom: 10,
    },
    label: {
        fontSize: 12,
        color: '#666',
        marginBottom: 2,
    },
    valor: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    subValor: {
        fontSize: 14,
        color: '#666',
    },
    divider: {
        height: 1,
        backgroundColor: '#eee',
        marginVertical: 10,
    },
    seccionTitulo: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#003d88',
        marginBottom: 8,
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    itemNombre: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    itemDetalle: {
        fontSize: 12,
        color: '#666',
    },
    itemTotal: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    itemCantidad: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#666',
    },
    totalesContainer: {
        backgroundColor: '#f9f9f9',
        padding: 10,
        borderRadius: 8,
        marginTop: 5,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
    },
    totalLabel: {
        fontSize: 14,
        color: '#666',
    },
    totalValor: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    granTotalLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    granTotalValor: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#00ad53',
    },
    footer: {
        flexDirection: 'row',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        gap: 10,
    },
    btnEditar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#003d88',
        gap: 5,
    },
    btnEditarTexto: {
        color: '#003d88',
        fontWeight: 'bold',
        fontSize: 16,
    },
    btnConfirmar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#00ad53',
        gap: 5,
    },
    btnConfirmarTexto: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default ResumenVentaModal;
