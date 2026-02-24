import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Alert, ImageBackground, StatusBar, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // 🆕 Importamos iconos profesionales
import { API_URL } from './config';
import { obtenerDispositivoId } from './services/ventasService';

const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Por favor ingrese usuario y contraseña');
      return;
    }

    setLoading(true);

    try {
      const dispositivoId = await obtenerDispositivoId();
      // Hacer petición al backend
      const response = await fetch(`${API_URL}/api/vendedores/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_vendedor: username,
          password: password,
          dispositivo_id: dispositivoId
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Login exitoso
        onLogin(true, data.vendedor.id_vendedor, data.vendedor.nombre, data.token || null);
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
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'android' ? -110 : 0}
      >
        <View style={styles.container}>
          <TextInput
            style={styles.input}
            placeholder="Nombre de usuario"
            value={username}
            onChangeText={setUsername}
            editable={!loading}
            autoCapitalize="characters"
            autoComplete="sms-otp"
            importantForAutofill="noExcludeDescendants"
          />

          {/* 🆕 Container de contraseña con diseño integrado */}
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Contraseña"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              autoComplete="sms-otp" // Engaña al sistema para que no lo vea como clave de login
              textContentType="oneTimeCode"
              importantForAutofill="noExcludeDescendants"
            />
            {password.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#333"
                />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#003d88" style={{ marginTop: 10 }} />
          ) : (
            <Button title="Iniciar sesión" onPress={handleLogin} />
          )}
        </View>
      </KeyboardAvoidingView>
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
  keyboardAvoid: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: '80%',
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Restaurado el tono original
    marginTop: 130, // Restaurado el margen original
    borderRadius: 10,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white', // Mismo fondo que el input de arriba
    borderRadius: 8,
    marginBottom: 15,
    paddingRight: 10,
  },
  passwordInput: {
    flex: 1,
    padding: 10,
  },
  eyeButton: {
    padding: 5,
  }
});

export default LoginScreen;
