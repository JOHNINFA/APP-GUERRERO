import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Vibration, ActivityIndicator, Alert, TextInput, Animated } from 'react-native';
import Checkbox from 'expo-checkbox';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ AJUSTAR ESTA URL SEGÚN EL ENTORNO
const API_URL_OBTENER = 'http://192.168.1.19:8000/api/obtener-cargue/';
const API_URL_ACTUALIZAR = 'http://192.168.1.19:8000/api/actualizar-check-vendedor/';

const Cargue = ({ userId }) => {
  const [selectedDay, setSelectedDay] = useState('Lunes');
  // Fecha actual en formato YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const url = `${API_URL_OBTENER}?vendedor_id=${userId}&dia=${selectedDay.toUpperCase()}&fecha=${selectedDate}`;
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
          } else {
            newQuantities[prod] = '0';
            newCheckedItems[prod] = { V: false, D: false };
          }
        });

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

    // Actualizar en el servidor
    try {
      const response = await fetch(API_URL_ACTUALIZAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendedor_id: userId,
          dia: selectedDay.toUpperCase(),
          fecha: selectedDate,
          producto: productName,
          v: nuevoValorV
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Actualizar estado local
        setCheckedItems(prev => ({
          ...prev,
          [productName]: {
            ...prev[productName],
            V: nuevoValorV
          }
        }));
        Vibration.vibrate(30);
        console.log(`✅ Check V actualizado: ${productName} = ${nuevoValorV}`);
      } else {
        Alert.alert('Error', result.message || 'No se pudo actualizar el check');
      }
    } catch (error) {
      console.error('Error actualizando check:', error);
      Alert.alert('Error', 'Error de conexión con el CRM');
    }
  };

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

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
      <View style={styles.navbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysContainer}>
          {dias.map(dia => (
            <TouchableOpacity
              key={dia}
              style={[styles.dayButton, selectedDay === dia && styles.selectedDayButton]}
              onPress={() => setSelectedDay(dia)}
            >
              <Text style={[styles.dayText, selectedDay === dia && styles.selectedDayText]}>{dia}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  navbar: {
    marginBottom: 10,
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
    marginTop: 30,
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
  titleContainer: {
    flexDirection: 'row', // Asegúrate de que los elementos estén en fila
    alignItems: 'center', // Alinea los elementos verticalmente en el centro
    backgroundColor: '#003d88',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: -10,
    marginBottom: 10,
    marginLeft: -5, // Ampliar franja a la izquierda
    paddingLeft: 15, // Compensar para que los títulos no se muevan
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
  },
  reloadButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default Cargue;