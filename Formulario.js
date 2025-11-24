import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import FormData from "form-data";

const Formulario = () => {
  const [cantidad, setCantidad] = useState("");
  const [email, setEmail] = useState("");



  const Submit = () => {
    const formDatab = new FormData();
    formDatab.append("Cantidad", cantidad);
    formDatab.append("Email", email);



    // ⚠️ FETCH COMENTADO TEMPORALMENTE - NO TOCAR GOOGLE SHEETS DURANTE DESARROLLO
    /*
    fetch("https://script.google.com/macros/s/AKfycbzFJHZN1cQLtCpjlOmT0Etf6RIkoClHEuyhodBDygiqclFR4sUXYqh_39cik9xDp6FIqw/exec", {
      method: "POST",
      body: formDatab,
    })
      .then((res) => {
        // Verificar el tipo de contenido de la respuesta
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return res.json(); // Si la respuesta es JSON, analizarla como JSON
        } else {
          return res.text(); // Si la respuesta no es JSON, devolver el texto
        }
      })
      .then((data) => {
        if (typeof data === "string") {
          console.log("Response Text:", data); // Registrar el texto de la respuesta
        } else {
          console.log("Parsed JSON:", data); // Registrar el JSON analizado
          // Aquí podrías manejar la respuesta JSON como desees
        }
      })
      .catch((error) => {
        console.log("Fetch Error:", error);
      });
    */
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Contact Me Form</Text>
      <Text style={styles.subheading}>
        This demonstrates how to send data from a mobile form to Google Sheets using React Native.
      </Text>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="cantidad"
          value={cantidad}
          onChangeText={(text) => setCantidad(text)}
        />
        <TextInput
          style={styles.input}
          placeholder="Your Email"
          value={email}
          onChangeText={(text) => setEmail(text)}
        />


        <TouchableOpacity style={styles.button} onPress={Submit}>
          <Text style={styles.buttonText}>Submit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  subheading: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  form: {
    width: "100%",
  },
  input: {
    backgroundColor: "#E8E8E9",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});

export default Formulario;