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

export const ConfirmarEntregaModal = ({ visible, onClose, onConfirmar, pedido }) => {
    if (!pedido) return null;

    const {
        numero_pedido,
        destinatario,
        detalles,
        total
    } = pedido;

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
                        <View>
                            <Text style={styles.titulo}>📦 Confirmar Entrega</Text>
                            <Text style={styles.subtitulo}>Pedido #{numero_pedido}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scrollView}>
                        {/* Cliente */}
                        <View style={styles.seccion}>
                            <Text style={styles.label}>Cliente:</Text>
                            <Text style={styles.valor}>{destinatario}</Text>
                        </View>

                        <View style={styles.divider} />

                        {/* Productos */}
                        <View style={styles.seccion}>
                            <Text style={styles.seccionTitulo}>📦 Productos del Pedido</Text>
                            {detalles && detalles.length > 0 ? (
                                detalles.map((p, index) => (
                                    <View key={index} style={styles.itemRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.itemNombre}>{p.producto_nombre}</Text>
                                            <Text style={styles.itemDetalle}>
                                                {p.cantidad} x {formatearMoneda(p.precio_unitario)}
                                            </Text>
                                        </View>
                                        <Text style={styles.itemTotal}>
                                            {formatearMoneda(p.cantidad * p.precio_unitario)}
                                        </Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.sinProductos}>Sin productos</Text>
                            )}
                        </View>

                        <View style={styles.divider} />

                        {/* Total */}
                        <View style={styles.totalesContainer}>
                            <View style={styles.totalRow}>
                                <Text style={styles.granTotalLabel}>TOTAL:</Text>
                                <Text style={styles.granTotalValor}>{formatearMoneda(parseFloat(total || 0))}</Text>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        {/* Mensaje de confirmación */}
                        <View style={styles.confirmacionContainer}>
                            <Ionicons name="checkmark-circle-outline" size={48} color="#22c55e" />
                            <Text style={styles.confirmacionTexto}>
                                ¿Confirmar que este pedido fue entregado al cliente?
                            </Text>
                        </View>
                    </ScrollView>

                    {/* Botones */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.btnCancelar}
                            onPress={onClose}
                        >
                            <Ionicons name="close-circle-outline" size={20} color="#dc3545" />
                            <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.btnConfirmar}
                            onPress={onConfirmar}
                        >
                            <Ionicons name="checkmark-circle" size={20} color="white" />
                            <Text style={styles.btnConfirmarTexto}>Confirmar Entrega</Text>
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
    subtitulo: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
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
    sinProductos: {
        fontSize: 14,
        color: '#999',
        fontStyle: 'italic',
    },
    totalesContainer: {
        backgroundColor: '#f0fdf4',
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#22c55e',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    granTotalLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#166534',
    },
    granTotalValor: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#22c55e',
    },
    confirmacionContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
    },
    confirmacionTexto: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginTop: 8,
        paddingHorizontal: 20,
    },
    footer: {
        flexDirection: 'row',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        gap: 10,
    },
    btnCancelar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#dc3545',
        gap: 5,
    },
    btnCancelarTexto: {
        color: '#dc3545',
        fontWeight: 'bold',
        fontSize: 14,
    },
    btnConfirmar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#22c55e',
        gap: 5,
    },
    btnConfirmarTexto: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
