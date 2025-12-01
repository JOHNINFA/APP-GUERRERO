import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Alert, ImageBackground, StatusBar, ActivityIndicator } from 'react-native';
import { API_URL } from './config';

const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Por favor ingrese usuario y contraseña');
      return;
    }

    setLoading(true);

    try {
      // Hacer petición al backend
      const response = await fetch(`${API_URL}/api/vendedores/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_vendedor: username,
          password: password
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Login exitoso
        onLogin(true, data.vendedor.id_vendedor, data.vendedor.nombre);
      } else {
        // Login fallido
        Alert.alert('Error', data.error || 'Credenciales incorrectas');
      }
    } catch (error) {
      console.error('Error de conexión:', error);
      Alert.alert(
        'Error de Conexión',
        'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={require('./images/banner.png')} style={styles.background}>
      <StatusBar hidden={true} />
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          placeholder="Nombre de usuario"
          value={username}
          onChangeText={setUsername}
          editable={!loading}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />
        {loading ? (
          <ActivityIndicator size="large" color="#003d88" style={{ marginTop: 10 }} />
        ) : (
          <Button title="Iniciar sesión" onPress={handleLogin} />
        )}
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  container: {
    width: '80%',
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 130,
    borderRadius: 10,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
});

export default LoginScreen;