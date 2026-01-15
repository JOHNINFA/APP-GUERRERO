import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Linking, Alert, ActivityIndicator, Vibration, Modal, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { obtenerClientesPorRutaYDia, marcarClienteVisitado, limpiarTodasLasVisitas } from '../../services/rutasApiService';
import { Ionicons } from '@expo/vector-icons';

const ListaClientes = ({ route, navigation }) => {
  const { ruta, rutaNombre, dia } = route.params;
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const spinValue = useRef(new Animated.Value(0)).current;

  // Referencia para evitar guardar orden innecesariamente al cargar
  const ordenInicialCargado = useRef(false);

  useEffect(() => {
    cargarClientes();

    // Monitorear conexión a internet
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);

      // Si se reconecta, sincronizar pendientes
      if (state.isConnected) {
        sincronizarPendientes();
      }
    });

    return () => unsubscribe();
  }, []);

  const cargarClientes = async (forzarRecarga = false) => {
    try {
      const nombreRutaCompleto = rutaNombre || ruta;
      const { userId } = route.params;
      const cacheKey = `clientes_${userId}_${nombreRutaCompleto}_${dia}`;

      let clientesBase = [];

      // 1. Intentar cargar desde caché
      if (!forzarRecarga) {
        try {
          const clientesCache = await AsyncStorage.getItem(cacheKey);
          if (clientesCache) {
            clientesBase = JSON.parse(clientesCache);
            setClientes(clientesBase);
            setLoading(false);
            return;
          }
        } catch (cacheError) { }
      }

      // 2. Si no hay caché o es forzado, cargar del backend
      clientesBase = await obtenerClientesPorRutaYDia(ruta, dia);

      // Ordenar por defecto por campo orden
      const ordenadosPorDefecto = [...clientesBase].sort((a, b) => (a.orden || 999) - (b.orden || 999));

      setClientes(ordenadosPorDefecto);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(ordenadosPorDefecto));

    } catch (error) {
      console.error('Error al cargar clientes:', error);
      Alert.alert('Error', 'No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  };

  const sincronizarPendientes = async () => {
    try {
      const { userId } = route.params;
      const nombreRutaCompleto = rutaNombre || ruta;
      const pendientesKey = `pendientes_${userId}_${nombreRutaCompleto}_${dia}`;

      const pendientesStr = await AsyncStorage.getItem(pendientesKey);
      if (!pendientesStr) return;

      const pendientes = JSON.parse(pendientesStr);

      for (const pendiente of pendientes) {
        await marcarClienteVisitado(nombreRutaCompleto, pendiente.orden, true);
      }

      await AsyncStorage.removeItem(pendientesKey);

    } catch (error) {
      console.error('Error al sincronizar pendientes:', error);
    }
  };

  const marcarVisitado = async (cliente) => {
    if (cliente.visitado) return;

    Vibration.vibrate(50);

    const clientesActualizados = clientes.map(c =>
      c.id === cliente.id ? { ...c, visitado: true } : c
    );
    setClientes([...clientesActualizados]);

    const nombreRutaCompleto = rutaNombre || ruta;
    const { userId } = route.params;
    const cacheKey = `clientes_${userId}_${nombreRutaCompleto}_${dia}`;
    const pendientesKey = `pendientes_${userId}_${nombreRutaCompleto}_${dia}`;

    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(clientesActualizados));
    } catch (error) { }

    if (!isConnected) {
      try {
        const pendientesStr = await AsyncStorage.getItem(pendientesKey);
        const pendientes = pendientesStr ? JSON.parse(pendientesStr) : [];
        pendientes.push({ orden: cliente.orden, timestamp: new Date().toISOString() });
        await AsyncStorage.setItem(pendientesKey, JSON.stringify(pendientes));
      } catch (error) { }
      return;
    }

    try {
      await marcarClienteVisitado(nombreRutaCompleto, cliente.orden, true);
    } catch (e) { console.error(e); }
  };

  const navegarDireccion = (cliente) => {
    let url;
    if (cliente.direccion && cliente.direccion.trim() !== '') {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.direccion)}`;
    } else if (cliente.coordenadas && cliente.coordenadas.trim() !== '') {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.coordenadas)}`;
    } else {
      Alert.alert('Error', 'No hay dirección ni coordenadas disponibles');
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir Maps'));
  };

  const limpiarTodo = () => {
    if (!isConnected) {
      Alert.alert('Sin Internet', 'Necesitas conexión a internet para limpiar las visitas.');
      return;
    }

    Alert.alert(
      'Limpiar Todas las Visitas',
      '¿Estás seguro? Esto limpiará visitas de esta ruta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar Todo',
          style: 'destructive',
          onPress: async () => {
            try {
              setRefreshing(true);
              const nombreRutaCompleto = rutaNombre || ruta;
              const resultado = await limpiarTodasLasVisitas(nombreRutaCompleto);

              if (resultado.success) {
                await cargarClientes(true);
                Alert.alert('Éxito', 'Todas las visitas han sido limpiadas');
              } else {
                Alert.alert('Sin Internet', 'No se pudieron limpiar las visitas. Verifica tu conexión.');
              }
            } catch (error) {
              console.error('Error al limpiar visitas:', error);
              Alert.alert('Sin Internet', 'No se pudieron limpiar las visitas. Verifica tu conexión.');
            } finally {
              setRefreshing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingFullScreen}>
          <ActivityIndicator size="large" color="#003d82" />
          <Text style={styles.loadingTitle}>Cargando Ruta...</Text>
        </View>
      </View>
    );
  }

  const refrescarClientes = async () => {
    setRefreshing(true);
    Animated.loop(
      Animated.timing(spinValue, { toValue: 1, duration: 500, useNativeDriver: true })
    ).start();
    await cargarClientes(true);
    spinValue.setValue(0);
    setRefreshing(false);
  };

  const spin = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const abrirModalNotas = (cliente) => {
    setClienteSeleccionado(cliente);
    setModalVisible(true);
  };

  const cerrarModalNotas = () => {
    setModalVisible(false);
    setTimeout(() => setClienteSeleccionado(null), 200);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#003d82" />
          </TouchableOpacity>
          <View style={styles.headerTexts}>
            <Text style={styles.title}>Lista de Clientes</Text>
            <Text style={styles.subtitle}>{clientes.length} clientes para hoy</Text>
          </View>
          <TouchableOpacity style={styles.botonRefrescar} onPress={refrescarClientes} disabled={refreshing}>
            {refreshing ? (
              <Animated.View style={[styles.miniLoader, { transform: [{ rotate: spin }] }]}>
                <View style={styles.miniLoaderSegmentDark} />
                <View style={styles.miniLoaderSegmentLight} />
              </Animated.View>
            ) : (
              <Ionicons name="refresh" size={24} color="#003d82" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={clientes}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.scrollContent}
        initialNumToRender={15}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No hay clientes para este día</Text>
            </View>
          )
        }
        ListFooterComponent={
          clientes.length > 0 && (
            <TouchableOpacity style={[styles.botonLimpiar, refreshing && styles.botonLimpiarDisabled]} onPress={limpiarTodo} disabled={refreshing}>
              <Text style={styles.botonLimpiarTexto}>Limpiar Todo</Text>
            </TouchableOpacity>
          )
        }
        renderItem={({ item: cliente }) => {
          const estaVisitado = cliente.visitado;

          return (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.clienteCard}
              onPress={() => abrirModalNotas(cliente)}
            >
              <View style={styles.clienteHeader}>
                <View style={styles.clienteInfo}>
                  <View style={styles.estadoContainer}>
                    <View style={[styles.estadoCirculo, estaVisitado && styles.estadoCirculoVisitado]}>
                      <Text style={[styles.ordenTexto, estaVisitado && styles.ordenTextoVisitado]}>
                        {cliente.orden}
                      </Text>
                    </View>
                    <Text style={styles.clienteNombre}>{cliente.nombre_negocio || 'Sin nombre'}</Text>
                  </View>
                  <Text style={styles.clienteTipo}>👤 {cliente.nombre_contacto || 'Sin contacto'}</Text>
                  {cliente.tipo_negocio && (
                    <Text style={styles.clienteTipoNegocio}>🏪 {cliente.tipo_negocio}</Text>
                  )}
                </View>
              </View>

              <View style={styles.clienteDetalles}>
                <Text style={styles.detalle}>📍 {cliente.direccion || 'Sin dirección'}</Text>
                <Text style={styles.detalle}>📞 {cliente.telefono || 'Sin teléfono'}</Text>
              </View>

              <View style={styles.botonesContainer}>
                <TouchableOpacity
                  style={[styles.botonMarcar, estaVisitado && styles.botonVisitado]}
                  onPress={() => !estaVisitado && marcarVisitado(cliente)}
                  disabled={estaVisitado}
                >
                  <Text style={styles.botonTexto}>{estaVisitado ? '✓ Visitado' : 'Marcar'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.botonVender}
                  onPress={() => navigation.navigate('Ventas', {
                    clientePreseleccionado: {
                      id: cliente.id,
                      nombre_negocio: cliente.nombre_negocio,
                      nombre_contacto: cliente.nombre_contacto,
                      direccion: cliente.direccion,
                      telefono: cliente.telefono
                    },
                    fromRuta: true,
                    rutaId: ruta,
                    rutaNombre: rutaNombre
                  })}
                >
                  <Text style={styles.botonTexto}>Vender</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.botonNavegar}
                  onPress={() => navegarDireccion(cliente)}
                >
                  <Text style={styles.botonTexto}>Navegar</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Modal de Notas */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={cerrarModalNotas}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Ionicons name="document-text" size={24} color="#003d82" />
              <Text style={styles.modalTitle}>Notas del Cliente</Text>
              <TouchableOpacity onPress={cerrarModalNotas}>
                <Ionicons name="close-circle" size={28} color="#666" />
              </TouchableOpacity>
            </View>

            {clienteSeleccionado && (
              <View style={styles.modalContent}>
                <Text style={styles.modalClienteNombre}>
                  {clienteSeleccionado.nombre_negocio || 'Cliente'}
                </Text>
                <View style={[styles.botonNotas, { alignSelf: 'stretch', justifyContent: 'center', marginTop: 10 }]}>
                  <Text style={styles.botonNotasTexto}>
                    {clienteSeleccionado.notas || 'Sin notas registradas'}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.botonLimpiar, { marginTop: 20, backgroundColor: '#003d82' }]}
              onPress={cerrarModalNotas}
            >
              <Text style={styles.botonLimpiarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: 'white',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
    marginRight: 10,
  },
  botonRefrescar: {
    padding: 8,
  },
  headerTexts: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  clienteCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 2,
  },
  clienteHeader: {
    marginBottom: 12,
  },
  clienteInfo: {
    flex: 1,
  },
  estadoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  estadoCirculo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  estadoCirculoVisitado: {
    backgroundColor: '#10B981',
  },
  ordenTexto: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  ordenTextoVisitado: {
    color: 'white',
  },
  clienteNombre: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  clienteTipo: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  clienteTipoNegocio: {
    fontSize: 12,
    color: '#003d82',
    marginTop: 2,
    fontWeight: '600',
    backgroundColor: '#e6f0ff',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  clienteDetalles: {
    marginTop: 4,
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  detalle: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  botonesContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  botonMarcar: {
    flex: 1,
    backgroundColor: '#003d82',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonVisitado: {
    backgroundColor: '#10B981',
  },
  botonVender: {
    flex: 1,
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonNavegar: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  loadingFullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003d82',
  },
  miniLoader: {
    width: 24,
    height: 24,
    borderWidth: 3,
    borderColor: '#003d82',
    borderRadius: 12,
    borderTopColor: 'transparent',
  },
  miniLoaderSegmentDark: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 24,
    height: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: 'transparent',
  },
  miniLoaderSegmentLight: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 24,
    height: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: 'transparent',
  },
  botonLimpiar: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 30
  },
  botonLimpiarDisabled: {
    opacity: 0.7
  },
  botonLimpiarTexto: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003d82',
    marginLeft: 10,
    flex: 1,
  },
  modalContent: {
    marginBottom: 10,
  },
  modalClienteNombre: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  botonNotas: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginBottom: 10,
  },
  botonNotasTexto: {
    fontSize: 15,
    color: '#495057',
    lineHeight: 22,
    fontStyle: 'italic',
  }
});

export default ListaClientes;
