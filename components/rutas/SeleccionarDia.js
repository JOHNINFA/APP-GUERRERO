import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const SeleccionarDia = ({ navigation, route }) => {
  const { ruta } = route.params;
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  
  const dias = [
    { codigo: 'L', nombre: 'Lunes' },
    { codigo: 'M', nombre: 'Martes' },
    { codigo: 'X', nombre: 'Miércoles' },
    { codigo: 'J', nombre: 'Jueves' },
    { codigo: 'V', nombre: 'Viernes' },
    { codigo: 'S', nombre: 'Sábado' },
  ];

  const scaleAnims = useRef(
    dias.reduce((acc, dia) => {
      acc[dia.codigo] = new Animated.Value(1);
      return acc;
    }, {})
  ).current;

  const handleSeleccionarDia = async (dia) => {
    setDiaSeleccionado(dia.codigo);

    // Animación de escala
    Animated.sequence([
      Animated.timing(scaleAnims[dia.codigo], {
        toValue: 1.1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnims[dia.codigo], {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    // Delay de 300ms antes de navegar
    setTimeout(async () => {
      try {
        await AsyncStorage.setItem('diaSeleccionado', dia.codigo);
        await AsyncStorage.setItem('diaNombreSeleccionado', dia.nombre);
        navigation.navigate('ListaClientes', { 
          ruta: route.params.ruta,
          rutaNombre: route.params.rutaNombre,
          dia: dia.codigo,
          userId: route.params.userId
        });
      } catch (error) {
        console.error('Error al guardar el día:', error);
      }
    }, 300);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>seleccionar-dia</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Seleccionar Día</Text>
        <Text style={styles.subtitle}>Ruta seleccionada: {ruta}</Text>
        <Text style={styles.question}>¿Qué día vas a trabajar hoy?</Text>

        <View style={styles.diasGrid}>
          {dias.map((dia) => (
            <Animated.View
              key={dia.codigo}
              style={[
                styles.diaWrapper,
                { transform: [{ scale: scaleAnims[dia.codigo] }] }
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.diaCard,
                  diaSeleccionado === dia.codigo && styles.diaCardSeleccionado,
                ]}
                onPress={() => handleSeleccionarDia(dia)}
              >
                <Image 
                  source={require('../../assets/camion.png')} 
                  style={[
                    styles.camionIcon,
                    diaSeleccionado === dia.codigo && styles.camionIconSeleccionado
                  ]}
                />
                <Text style={[
                  styles.diaNombre,
                  diaSeleccionado === dia.codigo && styles.diaNombreSeleccionado
                ]}>
                  {dia.nombre}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 15,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  question: {
    fontSize: 16,
    color: '#000',
    textAlign: 'center',
    marginBottom: 50,
  },
  diasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  diaWrapper: {
    width: '48%',
    marginBottom: 40,
  },
  diaCard: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  diaCardSeleccionado: {
    backgroundColor: '#003d82',
    elevation: 4,
  },
  camionIcon: {
    width: 24,
    height: 24,
    marginRight: 8,
    tintColor: '#000',
  },
  camionIconSeleccionado: {
    tintColor: '#fff',
  },
  diaNombre: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  diaNombreSeleccionado: {
    color: '#fff',
  },
});

export default SeleccionarDia;
