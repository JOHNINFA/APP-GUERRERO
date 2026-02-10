import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const Navbar = ({ selectedDay, onDaySelected, searchText, onSearchChange }) => {
  const navigation = useNavigation();
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  return (
    <View style={styles.header}>
      {/* 🆕 Fila con Volver y Badge SUGERIDO */}
      <View style={styles.topRow}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.navigate('Options')}
        >
          <Ionicons name="arrow-back" size={18} color="#00ad53" />
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
        
        <View style={styles.badge}>
          <Text style={styles.badgeText}>SUGERIDO</Text>
        </View>
      </View>

      {/* 🔍 Campo de búsqueda */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder="Buscar producto..."
          placeholderTextColor="#888"
          value={searchText || ''}
          onChangeText={onSearchChange || (() => {})}
        />
        {searchText && searchText.length > 0 && (
          <TouchableOpacity onPress={() => (onSearchChange || (() => {}))('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysContainer}>
        {days.map(day => (
          <TouchableOpacity 
            key={day} 
            style={[styles.dayButton, selectedDay === day && styles.selectedDayButton]} 
            onPress={() => onDaySelected(day)}
          >
            <Text style={[styles.dayText, selectedDay === day && styles.selectedDayText]}>{day}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: 'rgba(245, 245, 245, 0.6)',
    marginTop: 10,
    padding: 15,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
  },
  backButtonText: {
    color: '#00ad53',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 3,
  },
  badge: {
    backgroundColor: '#003d88',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    padding: 10,
  },
  clearButton: {
    padding: 5,
  },
  daysContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayButton: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginRight: 17,
  },
  selectedDayButton: {
    backgroundColor: '#003d88',
  },
  dayText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 14,
  },
  selectedDayText: {
    color: 'white',
  },
});

export default Navbar;
