import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatearMoneda } from '../../services/ventasService';

// Métodos de pago disponibles
const METODOS_PAGO = [
    { id: 'EFECTIVO', nombre: 'Efectivo', icono: 'cash-outline' },
    { id: 'NEQUI', nombre: 'Nequi', icono: 'phone-portrait-outline' },
    { id: 'DAVIPLATA', nombre: 'Daviplata', icono: 'phone-portrait-outline' },
    { id: 'TARJETA', nombre: 'Tarjeta', icono: 'card-outline' },
    { id: 'TRANSFERENCIA', nombre: 'Transferencia', icono: 'swap-horizontal-outline' },
];

const ResumenVentaModal = ({ visible, onClose, onConfirmar, venta }) => {
    const [fechaVenta, setFechaVenta] = useState(new Date());
    const [mostrarDatePicker, setMostrarDatePicker] = useState(false);
    const [metodoPago, setMetodoPago] = useState('EFECTIVO');
    const [enviarWhatsApp, setEnviarWhatsApp] = useState(false);
    const [numeroWhatsApp, setNumeroWhatsApp] = useState('');
    const [enviarCorreo, setEnviarCorreo] = useState(false);
    const [correoDestino, setCorreoDestino] = useState('');

    // Resetear valores cuando se abre el modal
    useEffect(() => {
        if (visible) {
            setFechaVenta(new Date());
            setMetodoPago('EFECTIVO');
            setEnviarWhatsApp(false);
            setNumeroWhatsApp(venta?.cliente_celular || '');
            setEnviarCorreo(false);
            setCorreoDestino('');
        }
    }, [visible]);

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

    // Formatear fecha para mostrar
    const formatearFecha = (date) => {
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dia = dias[date.getDay()];
        const dd = date.getDate().toString().padStart(2, '0');
        const mm = (date.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dia}, ${dd}/${mm}/${yyyy}`;
    };

    // Manejar cambio de fecha
    const onChangeFecha = (event, selectedDate) => {
        setMostrarDatePicker(false);
        if (selectedDate) {
            setFechaVenta(selectedDate);
        }
    };

    // Confirmar con la fecha y método de pago seleccionados
    const handleConfirmar = () => {
        const opcionesEnvio = {
            whatsapp: enviarWhatsApp ? numeroWhatsApp : null,
            correo: enviarCorreo ? correoDestino : null
        };
        onConfirmar(fechaVenta, metodoPago, opcionesEnvio);
    };

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
                        {/* Fecha de la Venta */}
                        <View style={styles.seccionFecha}>
                            <Text style={styles.labelFecha}>📅 Fecha de la Venta:</Text>
                            <TouchableOpacity 
                                style={styles.selectorFecha}
                                onPress={() => setMostrarDatePicker(true)}
                            >
                                <Text style={styles.fechaTexto}>{formatearFecha(fechaVenta)}</Text>
                                <Ionicons name="calendar-outline" size={20} color="#003d88" />
                            </TouchableOpacity>
                        </View>

                        {mostrarDatePicker && (
                            <DateTimePicker
                                value={fechaVenta}
                                mode="date"
                                display="default"
                                onChange={onChangeFecha}
                            />
                        )}

                        <View style={styles.divider} />

                        {/* Negocio y Cliente */}
                        <View style={styles.seccion}>
                            {cliente_negocio && (
                                <>
                                    <Text style={styles.label}>Negocio:</Text>
                                    <Text style={styles.valor}>{cliente_negocio}</Text>
                                </>
                            )}
                            <Text style={[styles.label, cliente_negocio && { marginTop: 8 }]}>Cliente:</Text>
                            <Text style={styles.valor}>{cliente_nombre}</Text>
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

                        {/* Método de Pago */}
                        <View style={styles.seccion}>
                            <Text style={styles.seccionTitulo}>💳 Método de Pago</Text>
                            <View style={styles.metodosPagoContainer}>
                                {METODOS_PAGO.map((metodo) => (
                                    <TouchableOpacity
                                        key={metodo.id}
                                        style={[
                                            styles.metodoPagoBtn,
                                            metodoPago === metodo.id && styles.metodoPagoBtnActivo
                                        ]}
                                        onPress={() => setMetodoPago(metodo.id)}
                                    >
                                        <Ionicons 
                                            name={metodo.icono} 
                                            size={18} 
                                            color={metodoPago === metodo.id ? 'white' : '#003d88'} 
                                        />
                                        <Text style={[
                                            styles.metodoPagoTexto,
                                            metodoPago === metodo.id && styles.metodoPagoTextoActivo
                                        ]}>
                                            {metodo.nombre}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={styles.divider} />

                        {/* Opciones de Envío */}
                        <View style={styles.seccion}>
                            <Text style={styles.seccionTitulo}>📤 Opciones de Envío</Text>
                            
                            {/* WhatsApp */}
                            <TouchableOpacity 
                                style={styles.checkboxRow}
                                onPress={() => setEnviarWhatsApp(!enviarWhatsApp)}
                            >
                                <View style={[styles.checkbox, enviarWhatsApp && styles.checkboxActivoWhatsApp]}>
                                    {enviarWhatsApp && <Ionicons name="checkmark" size={16} color="white" />}
                                </View>
                                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                                <Text style={styles.checkboxLabel}>WhatsApp</Text>
                            </TouchableOpacity>
                            
                            {enviarWhatsApp && (
                                <View style={styles.inputContainer}>
                                    <TextInput
                                        style={styles.whatsappInput}
                                        value={numeroWhatsApp}
                                        onChangeText={setNumeroWhatsApp}
                                        placeholder="Número: 3001234567"
                                        keyboardType="phone-pad"
                                        maxLength={10}
                                    />
                                </View>
                            )}

                            {/* Correo */}
                            <TouchableOpacity 
                                style={[styles.checkboxRow, { marginTop: 12 }]}
                                onPress={() => setEnviarCorreo(!enviarCorreo)}
                            >
                                <View style={[styles.checkbox, enviarCorreo && styles.checkboxActivoCorreo]}>
                                    {enviarCorreo && <Ionicons name="checkmark" size={16} color="white" />}
                                </View>
                                <Ionicons name="mail-outline" size={20} color="#EA4335" />
                                <Text style={styles.checkboxLabel}>Correo electrónico</Text>
                            </TouchableOpacity>
                            
                            {enviarCorreo && (
                                <View style={styles.inputContainer}>
                                    <TextInput
                                        style={styles.correoInput}
                                        value={correoDestino}
                                        onChangeText={setCorreoDestino}
                                        placeholder="correo@ejemplo.com"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>
                            )}
                        </View>

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
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>Método:</Text>
                                <Text style={[styles.totalValor, { color: '#003d88' }]}>{metodoPago}</Text>
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
                            onPress={handleConfirmar}
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
    seccionFecha: {
        marginBottom: 10,
    },
    labelFecha: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#003d88',
        marginBottom: 8,
    },
    selectorFecha: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f0f8ff',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#003d88',
    },
    fechaTexto: {
        fontSize: 16,
        fontWeight: '600',
        color: '#003d88',
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
    // Estilos Método de Pago
    metodosPagoContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    metodoPagoBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#003d88',
        backgroundColor: '#f0f8ff',
        gap: 5,
    },
    metodoPagoBtnActivo: {
        backgroundColor: '#003d88',
    },
    metodoPagoTexto: {
        fontSize: 12,
        fontWeight: '600',
        color: '#003d88',
    },
    metodoPagoTextoActivo: {
        color: 'white',
    },
    // Estilos WhatsApp
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#003d88',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxActivo: {
        backgroundColor: '#003d88',
    },
    checkboxActivoWhatsApp: {
        backgroundColor: '#25D366',
    },
    checkboxActivoCorreo: {
        backgroundColor: '#EA4335',
    },
    checkboxLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginLeft: 8,
    },
    inputContainer: {
        marginTop: 8,
        marginLeft: 34,
    },
    whatsappInput: {
        borderWidth: 1,
        borderColor: '#25D366',
        borderRadius: 8,
        padding: 10,
        fontSize: 14,
        backgroundColor: '#f0fff0',
    },
    correoInput: {
        borderWidth: 1,
        borderColor: '#EA4335',
        borderRadius: 8,
        padding: 10,
        fontSize: 14,
        backgroundColor: '#fff5f5',
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
