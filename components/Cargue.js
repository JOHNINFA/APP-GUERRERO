import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Vibration, ActivityIndicator, Alert, TextInput, Animated, Platform } from 'react-native';
import Checkbox from 'expo-checkbox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

// ⚠️ AJUSTAR ESTA URL SEGÚN EL ENTORNO
const API_URL_OBTENER = 'http://192.168.1.19:8000/api/obtener-cargue/';
const API_URL_ACTUALIZAR = 'http://192.168.1.19:8000/api/actualizar-check-vendedor/';
const API_URL_VERIFICAR_ESTADO = 'http://192.168.1.19:8000/api/verificar-estado-dia/';

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
  const scaleAnims = useRef({}).current;


  const productos = [
    'AREPA TIPO OBLEA 500Gr',
    'AREPA MEDIANA 330Gr',
    'AREPA TIPO PINCHO 330Gr',
    'AREPA QUESO CORRIENTE 450Gr',
    'AREPA QUESO ESPECIAL GRANDE 600Gr',
    'AREPA CON QUESO ESPECIAL PEQUEÑA 600Gr',
    'AREPA QUESO MINI X10',
    'AREPA CON QUESO CUADRADA 450Gr',
    'AREPA DE CHOCLO CORRIENTE 300Gr',
    'AREPA DE CHOCLO CON QUESO GRANDE 1200Gr',
    'AREPA DE CHOCLO CON QUESO PEQUEÑA 700Gr',
    'AREPA BOYACENSE X 5 450Gr',
    'AREPA SANTANDEREANA 450Gr',
    'ALMOJABANA X 5 300Gr',
    'AREPA CON SEMILLA DE QUINUA 450Gr',
    'AREPA DE MAIZ CON SEMILLA DE CHIA450Gr',
    'AREPAS DE MAIZ PETO CON SEMILLA DE AJONJOLI 450GR',
    'AREPA DE MAIZ PETO CON SEMILLAS DE LINAZA 450Gr',
    'AREPA DE MAIZ PETO CON SEMILLAS DE GIRASOL 450Gr',
    'AREPA DE MAIZ PETO CHORICERA 1000Gr',
    'AREPA DE MAIZ DE PETO TIPO LONCHERIA 500Gr',
    'AREPA DE MAIZ PETO CON MARGARINA Y SAL 500Gr',
    'YUCAREPA 500Gr',
    'AREPA TIPO ASADERO X 10 280Gr',
    'AREPA RELLENAR #1',
    'AREPA PARA RELLENA #2',
    'AREPA RELLENAR #3 1000Gr',
    'PORCION DE AREPA X 2 UND 55Gr',
    'PORCION DE AREPA 3 UND',
    'PORCION DE AREPA 4 UND 110 GR',
    'PORCION DE AREPA 5 UND',
    'AREPA SUPER OBLEA 500Gr',
    'LIBRA MASA',
    'MUTE BOYACENSE',
    'ENVUELTO DE MAÍZ 500Gr',
    'CANASTILLA'
  ];

  // Verificar estado del día
  const verificarEstadoDia = async (dia, fecha) => {
    try {
      const diaServidor = diasParaServidor[dia] || dia.toUpperCase().replace('Á', 'A').replace('É', 'E').replace('Í', 'I').replace('Ó', 'O').replace('Ú', 'U');
      const url = `${API_URL_VERIFICAR_ESTADO}?vendedor_id=${userId}&dia=${diaServidor}&fecha=${fecha}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setDiaEstado(data);
        console.log('📊 Estado del día:', data.estado, '- Total productos:', data.total_productos);

        // Si el día tiene datos marcados como DESPACHO, mostrar info
        if (data.estado === 'DESPACHO' && data.tiene_datos) {
          // No bloqueamos la edición, solo informamos
          console.log('ℹ️', data.mensaje);
        }
      }
    } catch (error) {
      console.error('Error verificando estado:', error);
      setDiaEstado(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);

    // Verificar estado del día primero
    await verificarEstadoDia(selectedDay, selectedDate);

    try {
      const diaServidor = diasParaServidor[selectedDay] || selectedDay.toUpperCase();
      const url = `${API_URL_OBTENER}?vendedor_id=${userId}&dia=${diaServidor}&fecha=${selectedDate}`;
      console.log('📥 Cargando cargue:', url);

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        const newQuantities = {};
        const newCheckedItems = {};

        productos.forEach(prod => {
          if (data[prod]) {
            newQuantities[prod] = data[prod].quantity;
            newCheckedItems[prod] = {
              V: data[prod].v || false,
              D: data[prod].d || false
            };
            // Debug: mostrar checks recibidos
            if (data[prod].d) {
              console.log(`✅ ${prod}: D=${data[prod].d}, V=${data[prod].v}`);
            }
          } else {
            newQuantities[prod] = '0';
            newCheckedItems[prod] = { V: false, D: false };
          }
        });
        
        console.log('📊 Checks cargados:', JSON.stringify(newCheckedItems).substring(0, 500));

        setQuantities(newQuantities);
        setCheckedItems(newCheckedItems);
        console.log('✅ Cargue cargado correctamente');
      } else {
        console.error('Error fetching cargue:', data);
        Alert.alert('Error', 'No se pudo obtener el cargue del CRM');
      }

    } catch (error) {
      console.error('Error fetching cargue:', error);
      Alert.alert('Error', 'Error de conexión con el CRM');
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos al cambiar día o fecha
  useEffect(() => {
    fetchData();
  }, [selectedDay, selectedDate, userId]);

  const handleCheckChange = async (productName, type) => {
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

    // Optimistic update - actualizar UI inmediatamente
    setCheckedItems(prev => ({
      ...prev,
      [productName]: {
        ...prev[productName],
        V: nuevoValorV
      }
    }));
    Vibration.vibrate(30);

    // Actualizar en el servidor en background
    try {
      const response = await fetch(API_URL_ACTUALIZAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendedor_id: userId,
          dia: diasParaServidor[selectedDay] || selectedDay.toUpperCase(),
          fecha: selectedDate,
          producto: productName,
          v: nuevoValorV
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`✅ Check V actualizado: ${productName} = ${nuevoValorV}`);
      } else {
        // Revertir si hay error
        setCheckedItems(prev => ({
          ...prev,
          [productName]: {
            ...prev[productName],
            V: !nuevoValorV
          }
        }));
        Alert.alert('Error', result.message || 'No se pudo actualizar el check');
      }
    } catch (error) {
      // Revertir si hay error de conexión
      setCheckedItems(prev => ({
        ...prev,
        [productName]: {
          ...prev[productName],
          V: !nuevoValorV
        }
      }));
      console.error('Error actualizando check:', error);
      Alert.alert('Error', 'Error de conexión con el CRM');
    }
  };

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
      console.log('📅 Nueva fecha seleccionada:', formattedDate);
    }
  };

  // Formatear fecha para mostrar
  const formatDateForDisplay = (dateStr) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateStr + 'T00:00:00'); // Evitar problema de timezone
    return date.toLocaleDateString('es-ES', options);
  };

  const renderProduct = ({ item }) => {
    const scale = scaleAnims[item] || new Animated.Value(1);
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
  };

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
            backgroundColor: diaEstado.completado ? '#dc3545' : '#007bff'
          }]}>
            <Text style={styles.miniBadgeText}>
              {diaEstado.completado ? '⚠️ DÍA FINALIZADO' : 'SUGERIDO'}
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

      <TouchableOpacity style={styles.reloadButton} onPress={fetchData}>
        <Text style={styles.reloadButtonText}>Recargar Cargue</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 5, // Reducido para dar más ancho a los productos
    paddingTop: 5,
    backgroundColor: '#f5f5f5',
  },
  navbar: {
    marginBottom: 2, // Reducido para acercar a títulos
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
    marginBottom: 40, // Espacio para los botones de Android
  },
  reloadButtonText: {
    color: 'white',
    fontSize: 18,
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