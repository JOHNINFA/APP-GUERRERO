import React, { useRef, useState, memo } from 'react';
import { View, Image, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

const Product = memo(({ product, quantity, onQuantityChange }) => {
  const inputRef = useRef(null);
  const [inputFocused, setInputFocused] = useState(false);

  const incrementQuantity = () => {
    const newQuantity = (parseInt(quantity) + 1).toString();
    onQuantityChange(product.name, newQuantity);
  };

  const decrementQuantity = () => {
    const newQuantity = (parseInt(quantity) > 0 ? parseInt(quantity) - 1 : 0).toString();
    onQuantityChange(product.name, newQuantity);
  };

  const handleQuantityChange = (text) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    onQuantityChange(product.name, numericValue);
  };

  const handleInputPress = () => {
    inputRef.current.focus();
    if (quantity === '0') {
      onQuantityChange(product.name, '');
    }
  };

  const handleInputFocus = () => {
    setInputFocused(true);
  };

  const handleInputBlur = () => {
    setInputFocused(false);
  };

  const inputStyle = [
    styles.input,
    inputFocused && styles.inputFocused, // Aplica el estilo cuando está enfocado
    quantity !== '0' && styles.inputHighlighted,
  ];

  // Determinar el source de la imagen
  const getImageSource = () => {
    if (!product.image) return null;
    
    // Si es una URL (string que empieza con http o data:image)
    if (typeof product.image === 'string') {
      return { uri: product.image };
    }
    
    // Si es un require() local
    return product.image;
  };

  const imageSource = getImageSource();

  return (
    <View style={styles.container}>
      {imageSource ? (
        <Image source={imageSource} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.imagePlaceholder, styles.image]} />
      )}
      <View style={styles.textContainer}>
        <Text style={[styles.description, { fontWeight: 'bold' }]}>{product.name}</Text>
        <TouchableOpacity onPress={handleInputPress} style={styles.inputContainer}>
          <TouchableOpacity onPress={decrementQuantity} style={styles.button}>
            <Text style={[styles.buttonText, { fontWeight: 'bold' }]}>-</Text>
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={inputStyle}
            placeholder="0"
            keyboardType="numeric"
            value={quantity === '0' ? '' : quantity}
            onChangeText={handleQuantityChange}
            textAlign="center"
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />
          <TouchableOpacity onPress={incrementQuantity} style={styles.button}>
            <Text style={[styles.buttonText, { fontWeight: 'bold' }]}>+</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    </View>
  );
});

Product.displayName = 'Product';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  image: {
    width: 130,
    height: 100,
    borderRadius: 20,
    marginRight: 15,
    marginLeft: -5,
  },
  imagePlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  description: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38.5,
    width: 180,
    marginTop: 10,
    borderColor: '#003d88',
    borderWidth: 0.5,
    borderRadius: 7,
  },
  button: {
    height: 40,
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
    backgroundColor: '#003d88',
    borderColor: '#003d88',
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 24,
    color: 'white',
  },
  input: {
    height: 40,
    borderColor: 'transparent',
    borderRadius: 5,
    paddingHorizontal: 10,
    textAlign: 'center',
    flex: 1,
    transition: 'all 0.2s', // Transición suave para el efecto
  },
  inputHighlighted: {
    backgroundColor: '#f0f0f0', // Sombreado gris suave
  },


});

export default Product;
