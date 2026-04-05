import React, { useState } from 'react';
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
    const [tieneVencidas, setTieneVencidas] = useState(false);
    const [metodoPago, setMetodoPago] = useState('EFECTIVO'); // 🆕 Estado para método de pago

    // Resetear valores cuando se abre el modal
    React.useEffect(() => {
        if (visible) {
            setTieneVencidas(false);
            setMetodoPago('EFECTIVO');
        }
    }, [visible]);

    if (!pedido) return <Modal visible={false} />;

    const {
        numero_pedido,
        destinatario,
        detalles,
        total
    } = pedido;

    return (
        <Modal
            visible={visible}
            animationType="fade"
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

                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                    >
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
                                detalles
                                    .filter(p => p.cantidad > 0) // 🆕 Ocultar productos eliminados (cantidad 0)
                                    .map((p, index) => (
                                        <View key={index} style={styles.itemRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.itemNombre}>{p.producto_nombre}</Text>
                                                <Text style={styles.itemDetalle}>
                                                    {p.cantidad} x {formatearMoneda(Math.round(parseFloat(p.precio_unitario || 0)))}
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
                                <Text style={styles.granTotalLabel}>TOTAL A COBRAR:</Text>
                                <Text style={styles.granTotalValor}>{formatearMoneda(parseFloat(total || 0))}</Text>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        {/* 🆕 SELECCIÓN DE MÉTODO DE PAGO */}
                        <View style={styles.seccion}>
                            <Text style={styles.seccionTitulo}>💰 Método de Pago</Text>
                            <View style={styles.pagosContainer}>
                                {/* Efectivo */}
                                <TouchableOpacity
                                    style={[styles.pagoBtn, metodoPago === 'EFECTIVO' && styles.pagoBtnActivo]}
                                    onPress={() => setMetodoPago('EFECTIVO')}
                                >
                                    <Ionicons
                                        name="cash-outline"
                                        size={24}
                                        color={metodoPago === 'EFECTIVO' ? 'white' : '#666'}
                                    />
                                    <Text style={[styles.pagoTexto, metodoPago === 'EFECTIVO' && styles.pagoTextoActivo]}>
                                        Efectivo
                                    </Text>
                                </TouchableOpacity>

                                {/* Nequi */}
                                <TouchableOpacity
                                    style={[styles.pagoBtn, metodoPago === 'NEQUI' && styles.pagoBtnActivo]}
                                    onPress={() => setMetodoPago('NEQUI')}
                                >
                                    <Ionicons
                                        name="phone-portrait-outline"
                                        size={24}
                                        color={metodoPago === 'NEQUI' ? 'white' : '#666'}
                                    />
                                    <Text style={[styles.pagoTexto, metodoPago === 'NEQUI' && styles.pagoTextoActivo]}>
                                        Nequi
                                    </Text>
                                </TouchableOpacity>

                                {/* Daviplata */}
                                <TouchableOpacity
                                    style={[styles.pagoBtn, metodoPago === 'DAVIPLATA' && styles.pagoBtnActivo]}
                                    onPress={() => setMetodoPago('DAVIPLATA')}
                                >
                                    <Ionicons
                                        name="card-outline"
                                        size={24}
                                        color={metodoPago === 'DAVIPLATA' ? 'white' : '#666'}
                                    />
                                    <Text style={[styles.pagoTexto, metodoPago === 'DAVIPLATA' && styles.pagoTextoActivo]}>
                                        Daviplata
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Mensaje de confirmación */}
                        <View style={styles.confirmacionContainer}>
                            <Text style={styles.confirmacionTexto}>
                                ¿Confirmar entrega?
                            </Text>
                        </View>

                        {/* Pregunta de vencidas */}
                        <View style={styles.vencidasContainer}>
                            <Text style={styles.vencidasPregunta}>¿El cliente tiene vencidas?</Text>
                            <View style={styles.vencidasOpciones}>
                                <TouchableOpacity
                                    style={[
                                        styles.opcionBtn,
                                        tieneVencidas && styles.opcionBtnActivo
                                    ]}
                                    onPress={() => setTieneVencidas(true)}
                                >
                                    <Ionicons
                                        name={tieneVencidas ? "checkmark-circle" : "checkmark-circle-outline"}
                                        size={20}
                                        color={tieneVencidas ? "white" : "#22c55e"}
                                    />
                                    <Text style={[
                                        styles.opcionTexto,
                                        tieneVencidas && styles.opcionTextoActivo
                                    ]}>Sí</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.opcionBtn,
                                        !tieneVencidas && styles.opcionBtnActivo
                                    ]}
                                    onPress={() => setTieneVencidas(false)}
                                >
                                    <Ionicons
                                        name={!tieneVencidas ? "close-circle" : "close-circle-outline"}
                                        size={20}
                                        color={!tieneVencidas ? "white" : "#dc3545"}
                                    />
                                    <Text style={[
                                        styles.opcionTexto,
                                        !tieneVencidas && styles.opcionTextoActivo
                                    ]}>No</Text>
                                </TouchableOpacity>
                            </View>
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
                            onPress={() => onConfirmar(tieneVencidas, metodoPago)} // 🆕 Pasar método de pago
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="checkmark-circle" size={20} color="white" />
                                <Text style={[styles.btnConfirmarTexto, { marginLeft: 5 }]}>Confirmar{"\n"}Entrega</Text>
                            </View>
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
        minHeight: '68%',
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
        flexGrow: 0,
        flexShrink: 1,
    },
    scrollContent: {
        padding: 15,
        paddingBottom: 10,
        flexGrow: 1,
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
        justifyContent: 'center',
        alignItems: 'center',
        padding: 5,
        borderRadius: 8,
        backgroundColor: '#22c55e',
    },
    btnConfirmarTexto: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
        textAlign: 'center',
    },
    // 🆕 Estilos para pregunta de vencidas
    vencidasContainer: {
        padding: 15,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        marginHorizontal: 15,
        marginTop: 10,
    },
    vencidasPregunta: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
        marginBottom: 12,
    },
    vencidasOpciones: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
    },
    opcionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: '#ddd',
        backgroundColor: 'white',
    },
    opcionBtnActivo: {
        backgroundColor: '#22c55e',
        borderColor: '#22c55e',
    },
    opcionTexto: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    opcionTextoActivo: {
        color: 'white',
    },
    opcionTextoActivo: {
        color: 'white',
    },
    // 🆕 Estilos para métodos de pago
    pagosContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    pagoBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: '#eee',
        backgroundColor: 'white',
        gap: 5,
    },
    pagoBtnActivo: {
        backgroundColor: '#003d88', // Azul App
        borderColor: '#003d88',
    },
    pagoTexto: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#666',
    },
    pagoTextoActivo: {
        color: 'white',
    },
});
