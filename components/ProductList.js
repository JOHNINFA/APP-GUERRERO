import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, Alert, ActivityIndicator, View, FlatList, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Product from './Product';
import { ENDPOINTS } from '../config';
import { obtenerProductos, sincronizarProductos } from '../services/ventasService';
import { obtenerAuthHeaders } from '../services/rutasApiService';
import productosConImagenes from './Productos'; // Importar mapeo de imágenes locales

const API_URL = ENDPOINTS.GUARDAR_SUGERIDO;

const ProductList = ({ selectedDay, userId, searchText }) => {
  const navigation = useNavigation();
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resumenEnvio, setResumenEnvio] = useState(null);

  // 🆕 Estado para productos dinámicos desde el servidor
  const [productos, setProductos] = useState([]);

  // 🔍 Filtrar productos según búsqueda
  const productosFiltrados = useMemo(() => {
    if (!searchText || searchText.trim() === '') {
      return productos;
    }

    const busqueda = searchText.toLowerCase().trim();
    return productos.filter(p =>
      p.name.toLowerCase().includes(busqueda)
    );
  }, [productos, searchText]);

  // 🆕 Cargar productos al montar el componente (con sincronización automática)
  useEffect(() => {
    const inicializar = async () => {
      // Primero cargar desde caché
      await cargarProductos();
      // Luego sincronizar en segundo plano
      sincronizarProductosAutomatico();
    };
    inicializar();
  }, []);

  // 🆕 Sincronizar productos automáticamente (sin bloquear UI)
  const sincronizarProductosAutomatico = async () => {
    try {
      console.log('🔄 Sincronizando productos en segundo plano...');
      await sincronizarProductos();
      await cargarProductos();
      console.log('✅ Productos sincronizados automáticamente');
    } catch (error) {
      console.warn('⚠️ No se pudo sincronizar (modo offline):', error.message);
    }
  };

  // 🆕 Cargar productos desde el servicio
  const cargarProductos = async () => {
    try {
      console.log('📦 Cargando productos para Sugeridos...');
      const productosData = obtenerProductos();

      // Función para buscar imagen por ID (más confiable que por nombre)
      const buscarImagenPorId = (idProducto) => {
        const producto = productosConImagenes.find(p => p.id === idProducto);
        return producto ? producto.image : null;
      };

      // Filtrar y convertir al formato esperado (con name e image desde assets locales)
      const productosFormateados = productosData
        .filter(p => p.disponible_app_sugeridos !== false) // Filtrar por disponible_app_sugeridos
        .map(p => {
          const imagen = buscarImagenPorId(p.id);

          if (!imagen) {
            console.log(`⚠️ Sin imagen para ID ${p.id}: "${p.nombre}"`);
          }

          return {
            name: p.nombre,
            id: p.id,
            image: imagen
          };
        });

      console.log(`✅ ${productosFormateados.length} productos cargados para Sugeridos (filtrados por disponible_app_sugeridos)`);
      setProductos(productosFormateados);
    } catch (error) {
      console.error('❌ Error cargando productos:', error);
      Alert.alert('Error', 'No se pudieron cargar los productos');
    }
  };

  // Crear un mapa de productos por nombre para búsqueda rápida
  const productMap = useMemo(() => {
    const map = {};
    productos.forEach(p => {
      map[p.name] = p;
    });
    return map;
  }, [productos]);

  // 🚀 OPTIMIZACIÓN: useCallback para evitar recrear función en cada render
  const handleQuantityChange = useCallback((productName, quantity) => {
    setQuantities((prevQuantities) => ({
      ...prevQuantities,
      [productName]: quantity,
    }));
  }, []);

  const handleSendPress = () => {
    if (!loading && selectedDay) {
      setShowDatePicker(true); // Abre el DatePicker para seleccionar fecha
    }
  };

  const handleDateChange = async (event, selectedDate) => {
    setShowDatePicker(false); // Cierra el DatePicker

    // Detectar si el usuario seleccionó "Cancelar" en lugar de confirmar la fecha
    if (event.type === 'dismissed') {
      return;
    }

    const currentDate = selectedDate || date;
    setDate(currentDate); // Actualiza la fecha seleccionada

    // ✅ CORREGIDO: Formatear fecha usando hora local (no UTC) para evitar cambio de día
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;





    // ✅ VALIDACIÓN: Verificar que el día seleccionado coincida con la fecha
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaDeLaFecha = diasSemana[currentDate.getDay()];




    if (diaDeLaFecha.toUpperCase() !== selectedDay.toUpperCase()) {
      Alert.alert(
        'Error de Fecha',
        `La fecha seleccionada (${formattedDate}) es ${diaDeLaFecha}, pero seleccionaste ${selectedDay}. Por favor elige una fecha que corresponda a ${selectedDay}.`
      );
      return;
    }

    // Filtrar productos con cantidad > 0
    const productosAEnviar = productos.map(p => ({
      nombre: p.name,
      cantidad: parseInt(quantities[p.name] || 0)
    })).filter(p => p.cantidad > 0);

    if (productosAEnviar.length === 0) {
      Alert.alert('Aviso', 'No hay productos con cantidades para enviar');
      return;
    }

    const payload = {
      vendedor_id: userId,
      dia: selectedDay.toUpperCase(),
      fecha: formattedDate,
      productos: productosAEnviar
    };

    const totalUnidades = productosAEnviar.reduce((sum, p) => sum + p.cantidad, 0);

    setResumenEnvio({
      payload,
      productos: productosAEnviar,
      fecha: formattedDate,
      totalUnidades
    });
    setShowConfirmModal(true);
  };

  const confirmarEnvioSugerido = async () => {
    if (!resumenEnvio?.payload) return;

    try {
      setLoading(true);
      const { payload, fecha } = resumenEnvio;

      console.log(`📤 Enviando ${payload.productos.length} productos al servidor...`);

      // 🆕 Timeout de 60 segundos para evitar espera infinita (aumentado para muchos productos)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: await obtenerAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (response.ok) {
        Alert.alert('Éxito', `Sugerido enviado correctamente.\n${result.message || ''}`);
        setQuantities({}); // Limpiar cantidades tras envío exitoso
        setShowConfirmModal(false);
        setResumenEnvio(null);
      } else {
        // ✅ Manejar error de sugerido duplicado
        if (result.error === 'YA_EXISTE_SUGERIDO') {
          setShowConfirmModal(false);
          setResumenEnvio(null);
          Alert.alert(
            'Sugerido Ya Existe',
            `Ya enviaste un sugerido para ${selectedDay} ${fecha}.\n\nNo puedes enviar otro sugerido para el mismo día.`,
            [{ text: 'Entendido', style: 'cancel' }]
          );
        } else {
          Alert.alert('Error', result.message || result.error || 'Error al enviar datos al CRM');
        }
      }

    } catch (error) {
      console.error('Error enviando sugerido:', error);

      // 🆕 Distinguir entre timeout y error de conexión
      if (error.name === 'AbortError') {
        Alert.alert(
          '⏱️ Tiempo Agotado',
          'La conexión está muy lenta. El servidor no respondió a tiempo.\n\nVerifica tu conexión a internet e intenta de nuevo.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          '❌ Error de Conexión',
          'No se pudo conectar con el CRM. Verifica tu conexión a internet.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // 🚀 OPTIMIZACIÓN: useCallback para evitar recrear función en cada render
  const renderProduct = useCallback(({ item }) => (
    <Product
      product={item}
      onQuantityChange={handleQuantityChange}
      quantity={quantities[item.name] || ''}
    />
  ), [handleQuantityChange, quantities]);



  return (
    <View style={styles.container}>
      {productos.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ad53" />
          <Text style={styles.loadingText}>Cargando productos...</Text>
        </View>
      ) : productosFiltrados.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="search-outline" size={60} color="#ccc" />
          <Text style={styles.noResultsText}>No se encontraron productos</Text>
          <Text style={styles.noResultsSubtext}>Intenta con otro término de búsqueda</Text>
        </View>
      ) : (
        <FlatList
          data={productosFiltrados}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.scrollContainer}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={50}
          getItemLayout={(data, index) => ({
            length: 150, // altura aproximada de cada item
            offset: 150 * index,
            index,
          })}
        />
      )}

      {selectedDay && (
        <TouchableOpacity
          style={[styles.sendButton, loading && styles.disabledButton]}
          onPress={handleSendPress}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Enviar Sugerido</Text>
          )}
        </TouchableOpacity>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}

      <Modal
        visible={showConfirmModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!loading) {
            setShowConfirmModal(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirmar Sugerido</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!loading) setShowConfirmModal(false);
                }}
                disabled={loading}
              >
                <Ionicons name="close-circle" size={28} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>Revisa los datos antes de enviar al CRM.</Text>

            <Text style={styles.modalInfo}>Día: {selectedDay}</Text>
            <Text style={styles.modalInfo}>Fecha: {resumenEnvio?.fecha || '-'}</Text>

            <ScrollView style={styles.modalList}>
              {(resumenEnvio?.productos || []).map((item, index) => (
                <View key={`${item.nombre}-${index}`} style={styles.modalItem}>
                  <Text style={styles.modalItemName} numberOfLines={2}>{item.nombre}</Text>
                  <View style={styles.modalQtyBadge}>
                    <Text style={styles.modalItemQty}>{item.cantidad}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowConfirmModal(false)}
                disabled={loading}
              >
                <Text style={styles.modalButtonCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm, loading && styles.disabledButton]}
                onPress={confirmarEnvioSugerido}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonConfirmText}>Confirmar y Enviar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 100, // Espacio para el botón flotante
  },
  scrollContainer: {
    padding: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },
  noResultsText: {
    marginTop: 15,
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  noResultsSubtext: {
    marginTop: 5,
    color: '#999',
    fontSize: 14,
  },
  sendButton: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#00ad53',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: '#a5d6a7',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003d88',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 10,
  },
  modalInfo: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 4,
  },
  modalList: {
    marginTop: 10,
    marginBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  modalItemName: {
    flex: 1,
    fontSize: 14,
    color: '#222',
    marginRight: 10,
  },
  modalQtyBadge: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#86efac',
    alignItems: 'center',
  },
  modalItemQty: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#15803d',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f1f3f5',
  },
  modalButtonCancelText: {
    color: '#495057',
    fontWeight: 'bold',
  },
  modalButtonConfirm: {
    backgroundColor: '#00ad53',
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default ProductList;
