import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Vibration, ActivityIndicator, Alert, TextInput, Platform } from 'react-native';
import Checkbox from 'expo-checkbox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ENDPOINTS } from '../config';
import { obtenerProductos, sincronizarProductos } from '../services/ventasService';

const Cargue = ({ userId }) => {
  const [selectedDay, setSelectedDay] = useState('Lunes');
  // Fecha actual en formato YYYY-MM-DD (usando fecha local, no UTC)
  const [selectedDate, setSelectedDate] = useState(() => {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [dateObject, setDateObject] = useState(new Date()); // Objeto Date para el picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [diaEstado, setDiaEstado] = useState(null); // Estado del día (SUGERIDO, DESPACHO, COMPLETADO)
  const [quantities, setQuantities] = useState({});
  const [checkedItems, setCheckedItems] = useState({});
  const [loading, setLoading] = useState(false);

  // 🆕 Ref para cancelar requests de checks rápidos POR PRODUCTO
  const checkControllersRef = useRef({});

  // 🆕 Estado para productos dinámicos desde el servidor
  const [productos, setProductos] = useState([]);

  // 🆕 Cargar productos desde el servicio
  const cargarProductos = async () => {
    try {
      console.log('📦 Cargando productos para Cargue...');
      const productosData = obtenerProductos();

      // Filtrar solo productos disponibles para cargue en la app
      const productosCargue = productosData
        .filter(p => p.nombre && p.disponible_app_cargue !== false) // Filtrar por disponible_app_cargue
        .map(p => p.nombre); // Extraer solo los nombres

      console.log(`✅ ${productosCargue.length} productos cargados para Cargue (filtrados por disponible_app_cargue)`);
      setProductos(productosCargue);
    } catch (error) {
      console.error('❌ Error cargando productos:', error);
      Alert.alert('Error', 'No se pudieron cargar los productos');
    }
  };



  // Verificar estado del día
  const verificarEstadoDia = async (dia, fecha) => {
    try {
      const diaServidor = diasParaServidor[dia] || dia.toUpperCase().replace('Á', 'A').replace('É', 'E').replace('Í', 'I').replace('Ó', 'O').replace('Ú', 'U');
      const url = `${ENDPOINTS.VERIFICAR_ESTADO_DIA}?vendedor_id=${userId}&dia=${diaServidor}&fecha=${fecha}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();

      if (data.success) {
        setDiaEstado(data);


        // Si el día tiene datos marcados como DESPACHO, mostrar info
        if (data.estado === 'DESPACHO' && data.tiene_datos) {
          // No bloqueamos la edición, solo informamos

        }
      }
    } catch (error) {
      console.error('Error verificando estado:', error);
      setDiaEstado(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);

    // 🔄 PASO 1: Sincronizar productos desde el servidor (con timeout)
    console.log('🔄 Sincronizando productos antes de recargar cargue...');
    try {
      // Timeout de 5 segundos para sincronización
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      await Promise.race([
        sincronizarProductos(),
        timeoutPromise
      ]);

      await cargarProductos(); // Recargar la lista actualizada
      console.log('✅ Productos sincronizados correctamente');
    } catch (error) {
      console.warn('⚠️ No se pudieron sincronizar productos:', error.message);
      // Continuar con productos en caché aunque falle la sincronización
      await cargarProductos();
    }

    // Verificar estado del día (con timeout)
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      await Promise.race([
        verificarEstadoDia(selectedDay, selectedDate),
        timeoutPromise
      ]);
    } catch (error) {
      console.warn('⚠️ No se pudo verificar estado del día:', error.message);
      // Continuar sin estado
    }

    // 🔄 PASO 2: Obtener cantidades del cargue (con timeout)
    try {
      const diaServidor = diasParaServidor[selectedDay] || selectedDay.toUpperCase();
      const url = `${ENDPOINTS.OBTENER_CARGUE}?vendedor_id=${userId}&dia=${diaServidor}&fecha=${selectedDate}`;

      console.log(`📥 Obteniendo cargue desde: ${url}`);

      // Timeout de 10 segundos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        const newQuantities = {};
        const newCheckedItems = {};

        productos.forEach(prod => {
          if (data[prod]) {
            // Para cargue: mostrar TOTAL (stock disponible = total - vendidas)
            newQuantities[prod] = data[prod].total || data[prod].quantity || '0';
            newCheckedItems[prod] = {
              V: data[prod].v || false,
              D: data[prod].d || false
            };
            // Debug: mostrar datos recibidos
            console.log(`📦 ${prod}: Total=${data[prod].total}, V=${data[prod].v}, D=${data[prod].d}`);
          } else {
            newQuantities[prod] = '0';
            newCheckedItems[prod] = { V: false, D: false };
          }
        });

        console.log('📊 Cantidades finales:', newQuantities);

        setQuantities(newQuantities);
        setCheckedItems(newCheckedItems);

      } else {
        console.error('Error fetching cargue:', data);
        Alert.alert('Error', 'No se pudo obtener el cargue del CRM');
      }

    } catch (error) {
      const esTimeout = error.name === 'AbortError';
      console.error('Error fetching cargue:', esTimeout ? 'Timeout' : error.message);

      Alert.alert(
        '⚠️ Error de Conexión',
        esTimeout
          ? 'El servidor tardó demasiado en responder.\n\nVerifica tu conexión e intenta de nuevo.'
          : 'No se pudo conectar con el servidor.\n\nVerifica tu conexión a internet.'
      );
    } finally {
      setLoading(false);
    }
  };

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
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      await Promise.race([sincronizarProductos(), timeoutPromise]);
      await cargarProductos();
      console.log('✅ Productos sincronizados automáticamente');
    } catch (error) {
      console.warn('⚠️ No se pudo sincronizar (modo offline):', error.message);
    }
  };

  // Cargar datos al cambiar día o fecha
  useEffect(() => {
    if (productos.length > 0) {
      fetchData();
    }
  }, [selectedDay, selectedDate, userId]); // ✅ Quitamos 'productos' para evitar bucle


  // 🚀 OPTIMIZACIÓN: useCallback para evitar recrear función en cada render
  const handleCheckChange = useCallback((productName, type) => {
    // Solo permitir cambiar V (Vendedor), D viene del CRM
    if (type === 'D') {
      Alert.alert('No Permitido', 'El check de Despachador solo se puede marcar desde el CRM.');
      return;
    }

    const nuevoValorV = !checkedItems[productName]?.V;
    const cantidad = parseInt(quantities[productName] || '0');
    const checkD = checkedItems[productName]?.D || false;

    // Validaciones antes de marcar V
    if (nuevoValorV) {
      if (!checkD) {
        Alert.alert(
          'Check Despachador Requerido',
          'No puedes marcar el check de Vendedor hasta que el Despachador lo haya marcado en el CRM.'
        );
        return;
      }

      if (cantidad <= 0) {
        Alert.alert(
          'Sin Cantidad',
          'No puedes marcar el check sin cantidad de producto.'
        );
        return;
      }
    }

    // ⚡ Optimistic update - actualizar UI INMEDIATAMENTE
    setCheckedItems(prev => ({
      ...prev,
      [productName]: {
        ...prev[productName],
        V: nuevoValorV
      }
    }));
    Vibration.vibrate(30);

    // 🔄 Actualizar en el servidor en segundo plano (con timeout)
    // Cancelar request anterior DEL MISMO PRODUCTO si existe
    if (checkControllersRef.current[productName]) {
      checkControllersRef.current[productName].abort();
    }
    const controller = new AbortController();
    checkControllersRef.current[productName] = controller;
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos

    fetch(ENDPOINTS.ACTUALIZAR_CHECK_VENDEDOR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendedor_id: userId,
        dia: diasParaServidor[selectedDay] || selectedDay.toUpperCase(),
        fecha: selectedDate,
        producto: productName,
        v: nuevoValorV
      }),
      signal: controller.signal
    })
      .then(response => {
        clearTimeout(timeoutId);
        // Limpiar referencia si fue exitoso
        if (checkControllersRef.current[productName] === controller) {
          delete checkControllersRef.current[productName];
        }
        return response.json();
      })
      .then(result => {
        console.log(`✅ Check V actualizado: ${productName} = ${nuevoValorV}`);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        const esTimeout = error.name === 'AbortError';

        // Si fue cancelado por otro check rápido en el MISMO producto, NO revertir
        if (esTimeout && controller !== checkControllersRef.current[productName]) {
          console.log(`⏭️ Check ${productName} cancelado por nuevo click, no revertir`);
          return;
        }

        // Solo revertir si fue timeout real o error de red
        if (controller === checkControllersRef.current[productName] || (!esTimeout && !controller.signal.aborted)) {
          console.error('Error actualizando check:', esTimeout ? 'Timeout' : error.message);
          setCheckedItems(prev => ({
            ...prev,
            [productName]: {
              ...prev[productName],
              V: !nuevoValorV
            }
          }));

          delete checkControllersRef.current[productName];

          Alert.alert(
            'Error',
            esTimeout
              ? 'El servidor tardó demasiado. El check se revirtió.'
              : 'No se pudo actualizar el check. Se revirtió el cambio.'
          );
        }
      });
  }, [checkedItems, quantities, userId, selectedDay, selectedDate]);

  const dias = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

  // Mapeo para enviar al servidor sin tildes
  const diasParaServidor = {
    'Lunes': 'LUNES',
    'Martes': 'MARTES',
    'Miercoles': 'MIERCOLES',
    'Jueves': 'JUEVES',
    'Viernes': 'VIERNES',
    'Sabado': 'SABADO'
  };

  // Manejar cambio de fecha en el DatePicker
  const onDateChange = (event, date) => {
    setShowDatePicker(Platform.OS === 'ios'); // En iOS mantener visible

    if (date) {
      setDateObject(date);
      // Usar fecha local en lugar de toISOString() que convierte a UTC
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      setSelectedDate(formattedDate);

    }
  };

  // Formatear fecha para mostrar
  const formatDateForDisplay = (dateStr) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateStr + 'T00:00:00'); // Evitar problema de timezone
    return date.toLocaleDateString('es-ES', options);
  };

  // 🚀 OPTIMIZACIÓN: useCallback para evitar recrear función en cada render
  const renderProduct = useCallback(({ item }) => {
    const cantidad = quantities[item] || '0';

    return (
      <View style={styles.productContainer}>
        {/* Checkbox V (Vendedor) */}
        <View style={{ width: 30, alignItems: 'center' }}>
          <Checkbox
            value={checkedItems[item]?.V || false}
            onValueChange={() => handleCheckChange(item, 'V')}
            style={styles.checkbox}
            color={checkedItems[item]?.V ? '#28a745' : undefined}
          />
        </View>

        {/* Checkbox D (Despachador - Solo Lectura) */}
        <View style={{ width: 30, alignItems: 'center' }}>
          <Checkbox
            value={checkedItems[item]?.D || false}
            onValueChange={() => handleCheckChange(item, 'D')}
            style={styles.checkbox}
            color={checkedItems[item]?.D ? '#28a745' : '#ccc'}
            disabled={true}
          />
        </View>

        {/* Cantidad (Solo Lectura) */}
        <View style={styles.inputContainer}>
          <Text style={styles.quantity}>{cantidad}</Text>
        </View>

        {/* Descripción */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>{item}</Text>
        </View>
      </View>
    );
  }, [checkedItems, quantities, handleCheckChange]);

  return (
    <View style={styles.container}>
      {/* Solo mostrar el DatePicker cuando showDatePicker sea true */}
      {showDatePicker && (
        <DateTimePicker
          value={dateObject}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          maximumDate={new Date(2030, 11, 31)}
          minimumDate={new Date(2020, 0, 1)}
        />
      )}

      <View style={styles.navbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysContainer}>
          {dias.map(dia => (
            <TouchableOpacity
              key={dia}
              style={[styles.dayButton, selectedDay === dia && styles.selectedDayButton]}
              onPress={() => {
                setSelectedDay(dia);
                setShowDatePicker(true); // Abrir calendario al tocar un día
              }}
            >
              <Text style={[styles.dayText, selectedDay === dia && styles.selectedDayText]}>{dia}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Barra de Información del Día Seleccionado */}
      <View style={styles.infoBar}>
        <Text style={styles.infoDateText}>📅 {formatDateForDisplay(selectedDate)}</Text>
        {diaEstado?.tiene_datos && (
          <View style={[styles.miniBadge, {
            backgroundColor: diaEstado.completado ? '#dc3545' : '#00ad53'
          }]}>
            <Text style={styles.miniBadgeText}>
              {diaEstado.completado ? '⚠️ DÍA FINALIZADO' : 'CARGUE'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.titleContainer}>
        <Text style={[styles.title, styles.titleCheckbox, styles.titleV]}>V</Text>
        <Text style={[styles.title, styles.titleCheckbox, styles.titleD]}>D</Text>
        <Text style={[styles.title, styles.titleQuantity, styles.titleC]}>Cant</Text>
        <Text style={[styles.title, styles.titledescripcion, styles.titleP]}>Producto</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#033468" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={productos}
          keyExtractor={item => item}
          renderItem={renderProduct}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
          contentContainerStyle={styles.listContent}
        />
      )}

      <TouchableOpacity
        style={styles.reloadButton}
        onPress={fetchData}
        disabled={loading}
      >
        <Text style={styles.reloadButtonText}>
          {loading ? 'Cargando...' : 'Recargar'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 5,
    paddingTop: 5,
    backgroundColor: '#f5f5f5',
  },
  navbar: {
    marginBottom: 2,
  },
  daysContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dayButton: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    marginTop: 35, // Aumentado para bajar más los botones
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  selectedDayButton: {
    backgroundColor: '#F0F0F0',
    elevation: 3,
    shadowOpacity: 0.3,
  },
  dayText: {
    fontSize: 14,
    color: '#000',
    fontWeight: 'bold',
  },
  selectedDayText: {
    color: 'black',
  },
  dayDateText: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#003d88',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2, // Reducido para acercar a días
    marginBottom: 5,
    marginLeft: -5,
    paddingLeft: 15,
  },
  title: {
    // Otros estilos generales para el texto
    fontSize: 16,
  },
  titleCheckbox: {
    flex: 0.5,
    paddingLeft: 0,
    paddingRight: 0,
  },
  titleV: {
    marginLeft: 2,
    marginRight: -4, // Ajusta este valor para mover "V" hacia la derecha
  },
  titleD: {
    marginLeft: -8, // Acercar a V
    marginRight: 8, // Compensar para mantener Cant en su lugar
  },
  titleC: {
    marginRight: 29, // Ajusta este valor para mover "C" hacia la izquierda
  },

  titleP: {
    marginRight: 60, // Ajusta este valor para mover "C" hacia la izquierda
  },
  titleQuantity: {
    // Otros estilos específicos para la cantidad si es necesario
  },

  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  titleCheckbox: {
    flex: 0.5,
    paddingLeft: 0,
    paddingRight: 0,
  },
  titleQuantity: {
    flex: 1,
    marginRight: 13,
  },
  titleProduct: {
    flex: 2,
    textAlign: 'center',
  },
  productContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  descriptionContainer: {
    flex: 2,
    backgroundColor: 'white',
    borderColor: '#66b3ff',
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    height: '100%',
  },
  description: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#808080',
  },
  inputContainer: {
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
    width: '20%',
  },
  quantity: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    padding: 8,
    borderColor: '#66b3ff',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: 'white',
    width: '100%',
    color: '#808080',
    marginLeft: 7,
  },
  checkbox: {
    width: 20,
    height: 20,
    marginRight: 7,
    borderRadius: 3,
    borderWidth: 1,
  },
  reloadButton: {
    backgroundColor: '#28a745',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 40,
  },
  reloadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Estilos para el selector de fecha
  dateSelector: {
    backgroundColor: '#007bff',
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  dateSelectorText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  estadoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    elevation: 2,
  },
  estadoBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Estilos para la barra de info
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 5,
    marginBottom: 5,
  },
  infoDateText: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'bold',
  },
  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  miniBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default Cargue;